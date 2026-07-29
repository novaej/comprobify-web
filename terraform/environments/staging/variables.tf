variable "do_token" {
  description = "DigitalOcean API token, dedicated to this repo's pipeline (comprobify-web-terraform-staging) - not reused from the comprobify API repo's token, so a leak in one repo's CI doesn't require rotating the other's. Supply via TF_VAR_do_token, never in a committed file."
  type        = string
  sensitive   = true
}

variable "cloudflare_token" {
  description = "Cloudflare API token, scoped to the comprobify.com zone, dedicated to this repo's pipeline. Supply via TF_VAR_cloudflare_token, never in a committed file."
  type        = string
  sensitive   = true
}

variable "region" {
  description = "App Platform region slug (metro-level, e.g. \"nyc\") - see modules/app-platform/variables.tf for why this differs from Droplet/Spaces slugs"
  type        = string
  default     = "nyc"
}

variable "instance_size_slug" {
  description = "Verify via `doctl apps tier instance-size list` before first apply - no default here on purpose, don't guess"
  type        = string
}

variable "github_repo" {
  type    = string
  default = "novaej/comprobify-web"
}

variable "domain_primary" {
  type    = string
  default = "staging.comprobify.com"
}

variable "domain_alias" {
  type    = string
  default = "app-staging.comprobify.com"
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for comprobify.com - same zone the API repo's Terraform already uses"
  type        = string
}

variable "database_ssl" {
  type    = string
  default = "true"
}

variable "comprobify_api_url" {
  type = string
}

variable "sentry_dsn" {
  type    = string
  default = ""
}

variable "next_public_sentry_dsn" {
  type    = string
  default = ""
}

variable "app_env" {
  type    = string
  default = "staging"
}

variable "next_public_app_env" {
  type    = string
  default = "staging"
}

variable "mailgun_domain" {
  type    = string
  default = ""
}

variable "mailgun_from" {
  type    = string
  default = ""
}

variable "support_email" {
  type    = string
  default = ""
}

variable "support_phone" {
  type    = string
  default = ""
}

variable "next_public_marketing_url" {
  type    = string
  default = "https://staging.comprobify.com"
}

variable "next_public_app_url" {
  type    = string
  default = "https://app-staging.comprobify.com"
}

# --- secrets, no defaults, sourced only from TF_VAR_ at apply time ---

variable "database_url" {
  type      = string
  sensitive = true
}

variable "auth_secret" {
  type      = string
  sensitive = true
}

variable "encryption_key" {
  type      = string
  sensitive = true
}

variable "context_cookie_secret" {
  type      = string
  sensitive = true
}

variable "database_ssl_ca" {
  type      = string
  sensitive = true
  default   = ""
}

variable "sentry_auth_token" {
  type      = string
  sensitive = true
  default   = ""
}

variable "mailgun_api_key" {
  type      = string
  sensitive = true
  default   = ""
}

variable "comprobify_admin_secret" {
  type      = string
  sensitive = true
  default   = ""
}
