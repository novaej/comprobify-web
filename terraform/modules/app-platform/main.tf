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
      # run_command intentionally omitted - leaves it on the buildpack's auto-detected
      # `npm start` (`next start`, reads the PORT App Platform injects automatically).
      # See docs/deployment.md's Build settings table for why this one is safe to leave
      # alone while build_command is not.

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
resource "cloudflare_record" "primary" {
  zone_id = var.cloudflare_zone_id
  # cloudflare_record.name wants the bare subdomain (e.g. "staging"), not the FQDN used
  # above in domain{} - matches comprobify/terraform/modules/droplet's own
  # cloudflare_record.api convention. Derived from the one FQDN variable rather than a
  # second variable, so there's only one source of truth to keep in sync.
  name    = trimsuffix(var.domain_primary, ".${var.cloudflare_zone_name}")
  type    = "CNAME"
  content = digitalocean_app.this.default_ingress
  proxied = false
  ttl     = 1
}

resource "cloudflare_record" "alias" {
  zone_id = var.cloudflare_zone_id
  name    = trimsuffix(var.domain_alias, ".${var.cloudflare_zone_name}")
  type    = "CNAME"
  content = digitalocean_app.this.default_ingress
  proxied = false
  ttl     = 1
}
