terraform {
  required_version = ">= 1.7"
  required_providers {
    digitalocean = { source = "digitalocean/digitalocean", version = "~> 2.40" }
    cloudflare   = { source = "cloudflare/cloudflare", version = "~> 4.0" }
  }
}

provider "digitalocean" {
  token = var.do_token
}

provider "cloudflare" {
  api_token = var.cloudflare_token
}

module "staging" {
  source = "../../modules/app-platform"

  environment           = "staging"
  region                = var.region
  vpc_datacenter_region = var.vpc_datacenter_region
  instance_size_slug    = var.instance_size_slug
  github_repo           = var.github_repo
  branch                = "staging"
  domain_primary        = var.domain_primary
  domain_alias          = var.domain_alias
  cloudflare_zone_id    = var.cloudflare_zone_id

  database_ssl              = var.database_ssl
  comprobify_api_url        = var.comprobify_api_url
  sentry_dsn                = var.sentry_dsn
  next_public_sentry_dsn    = var.next_public_sentry_dsn
  app_env                   = var.app_env
  next_public_app_env       = var.next_public_app_env
  mailgun_domain            = var.mailgun_domain
  mailgun_from              = var.mailgun_from
  support_email             = var.support_email
  support_phone             = var.support_phone
  next_public_marketing_url = var.next_public_marketing_url
  next_public_app_url       = var.next_public_app_url

  database_url            = var.database_url
  auth_secret             = var.auth_secret
  encryption_key          = var.encryption_key
  context_cookie_secret   = var.context_cookie_secret
  database_ssl_ca         = var.database_ssl_ca
  sentry_auth_token       = var.sentry_auth_token
  mailgun_api_key         = var.mailgun_api_key
  comprobify_admin_secret = var.comprobify_admin_secret
  internal_service_secret = var.internal_service_secret
}
