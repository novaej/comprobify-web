terraform {
  required_providers {
    digitalocean = { source = "digitalocean/digitalocean" }
    cloudflare   = { source = "cloudflare/cloudflare" }
  }
}

resource "digitalocean_app" "this" {
  spec {
    name   = "comprobify-web-${var.environment}"
    region = var.region

    vpc {
      id = data.digitalocean_vpc.this.id
    }

    domain {
      name = var.domain_primary
      type = "PRIMARY"
    }

    domain {
      name = var.domain_alias
      type = "ALIAS"
    }

    service {
      name               = "web"
      instance_count     = 1
      instance_size_slug = var.instance_size_slug

      github {
        repo           = var.github_repo
        branch         = var.branch
        deploy_on_push = true
      }

      source_dir    = var.source_dir
      build_command = var.build_command
      run_command   = var.run_command
      # run_command must be explicit now too: prisma migrate deploy moved out of the build
      # command (build:deploy) into here (start:deploy), since App Platform's build phase
      # has no network path to the database at all - confirmed empirically (Trusted
      # Sources correctly configured for the app, using the public DB endpoint, still
      # unreachable from the build step, while the same endpoint worked fine from a local
      # machine with its own IP trusted). The running service, once actually started, does
      # have network access - matches the same pattern the comprobify API repo already
      # uses (migrations run at process startup, not at build/CI time).

      # Without this block, App Platform defaults to probing "/" - which renders the
      # full marketing landing page (locale routing -> (marketing)/page.tsx), which
      # calls listTiers() server-side, cascading every liveness check into an API
      # call. /api/health is a dedicated route that returns 200 with no DB query and
      # no Comprobify API call, so the probe stays local to this service.
      health_check {
        http_path = "/api/health"
      }

      env {
        key   = "DATABASE_URL"
        value = var.database_url
        type  = "SECRET"
        scope = "RUN_AND_BUILD_TIME"
      }
      env {
        key   = "AUTH_SECRET"
        value = var.auth_secret
        type  = "SECRET"
        scope = "RUN_AND_BUILD_TIME"
      }
      env {
        key   = "ENCRYPTION_KEY"
        value = var.encryption_key
        type  = "SECRET"
        scope = "RUN_AND_BUILD_TIME"
      }
      env {
        key   = "CONTEXT_COOKIE_SECRET"
        value = var.context_cookie_secret
        type  = "SECRET"
        scope = "RUN_AND_BUILD_TIME"
      }
      env {
        key   = "DATABASE_SSL"
        value = var.database_ssl
        type  = "GENERAL"
        scope = "RUN_TIME"
      }
      env {
        key   = "DATABASE_SSL_CA"
        value = var.database_ssl_ca
        type  = "SECRET"
        scope = "RUN_TIME"
      }
      env {
        key   = "COMPROBIFY_API_URL"
        value = var.comprobify_api_url
        type  = "GENERAL"
        scope = "RUN_AND_BUILD_TIME"
      }
      env {
        key   = "SENTRY_DSN"
        value = var.sentry_dsn
        type  = "GENERAL"
        scope = "RUN_AND_BUILD_TIME"
      }
      env {
        key   = "NEXT_PUBLIC_SENTRY_DSN"
        value = var.next_public_sentry_dsn
        type  = "GENERAL"
        scope = "RUN_AND_BUILD_TIME"
      }
      env {
        key   = "APP_ENV"
        value = var.app_env
        type  = "GENERAL"
        scope = "RUN_AND_BUILD_TIME"
      }
      env {
        key   = "NEXT_PUBLIC_APP_ENV"
        value = var.next_public_app_env
        type  = "GENERAL"
        scope = "RUN_AND_BUILD_TIME"
      }
      env {
        key   = "SENTRY_AUTH_TOKEN"
        value = var.sentry_auth_token
        type  = "SECRET"
        scope = "BUILD_TIME"
      }
      env {
        key   = "MAILGUN_API_KEY"
        value = var.mailgun_api_key
        type  = "SECRET"
        scope = "RUN_AND_BUILD_TIME"
      }
      env {
        key   = "MAILGUN_DOMAIN"
        value = var.mailgun_domain
        type  = "GENERAL"
        scope = "RUN_AND_BUILD_TIME"
      }
      env {
        key   = "MAILGUN_FROM"
        value = var.mailgun_from
        type  = "GENERAL"
        scope = "RUN_AND_BUILD_TIME"
      }
      env {
        key   = "COMPROBIFY_ADMIN_SECRET"
        value = var.comprobify_admin_secret
        type  = "SECRET"
        scope = "RUN_AND_BUILD_TIME"
      }
      env {
        # Only read inside Server Actions at request time (src/lib/client-forwarding.ts),
        # never at build time - same scope reasoning as database_ssl_ca.
        key   = "INTERNAL_SERVICE_SECRET"
        value = var.internal_service_secret
        type  = "SECRET"
        scope = "RUN_TIME"
      }
      env {
        key   = "SUPPORT_EMAIL"
        value = var.support_email
        type  = "GENERAL"
        scope = "RUN_AND_BUILD_TIME"
      }
      env {
        key   = "SUPPORT_PHONE"
        value = var.support_phone
        type  = "GENERAL"
        scope = "RUN_AND_BUILD_TIME"
      }
      env {
        key   = "NEXT_PUBLIC_MARKETING_URL"
        value = var.next_public_marketing_url
        type  = "GENERAL"
        scope = "RUN_AND_BUILD_TIME"
      }
      env {
        key   = "NEXT_PUBLIC_APP_URL"
        value = var.next_public_app_url
        type  = "GENERAL"
        scope = "RUN_AND_BUILD_TIME"
      }
    }
  }
}

# Looked up, not created/owned - same reasoning as comprobify/terraform/modules/droplet's
# data "digitalocean_project": this project is a permanent, external grouping shared with
# the API's droplet. Managing it as a resource here would risk Terraform trying to destroy
# the real, shared project on any config drift. "Comprobify Staging" already exists.
data "digitalocean_project" "this" {
  name = "Comprobify ${title(var.environment)}"
}

# App Platform apps never auto-join a VPC - the spec's vpc.id must be set explicitly, or
# the app has no private-network route to the database at all (confirmed against DO's own
# docs: "App Platform apps do not automatically join a VPC"). Specifying just `region`
# (the datacenter-level slug, e.g. "nyc1" - distinct from var.region's App-Platform-level
# "nyc" metro slug) returns that region's default VPC, which is where the database and the
# API's droplet already live.
data "digitalocean_vpc" "this" {
  region = var.vpc_datacenter_region
}

resource "digitalocean_project_resources" "this" {
  project   = data.digitalocean_project.this.id
  resources = [digitalocean_app.this.urn]
}

# comprobify.com's DNS is hosted on Cloudflare - the domain{} blocks above only tell App
# Platform to expect and issue a cert for each domain, they don't create the DNS record
# that routes traffic there. Mirrors comprobify/terraform/modules/droplet's
# cloudflare_record.api, with one deliberate difference: proxied = false here, not true.
#
# App Platform re-verifies each domain's CNAME on every deploy as part of its own cert
# issuance/renewal. With Cloudflare's proxy in front, App Platform would see Cloudflare's
# proxy IP instead of resolving through to itself, breaking verification - a documented,
# common failure mode connecting Cloudflare-hosted domains to App Platform. Consequence:
# these two domains don't get Cloudflare's WAF/DDoS layer the way api-staging does.
#
# default_ingress is a full URL (https://...), not a bare hostname - CNAME content can't
# include the scheme.
locals {
  app_ingress_hostname = trimprefix(digitalocean_app.this.default_ingress, "https://")
}

resource "cloudflare_record" "primary" {
  zone_id = var.cloudflare_zone_id
  # cloudflare_record.name wants the bare subdomain (e.g. "staging"), not the FQDN used
  # above in domain{} - matches comprobify/terraform/modules/droplet's own
  # cloudflare_record.api convention. Derived from the one FQDN variable rather than a
  # second variable, so there's only one source of truth to keep in sync.
  name    = trimsuffix(var.domain_primary, ".${var.cloudflare_zone_name}")
  type    = "CNAME"
  content = local.app_ingress_hostname
  proxied = false
  ttl     = 1
}

resource "cloudflare_record" "alias" {
  zone_id = var.cloudflare_zone_id
  name    = trimsuffix(var.domain_alias, ".${var.cloudflare_zone_name}")
  type    = "CNAME"
  content = local.app_ingress_hostname
  proxied = false
  ttl     = 1
}
