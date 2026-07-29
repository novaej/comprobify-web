variable "environment" {
  description = "Environment name: \"staging\" or \"production\""
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be \"staging\" or \"production\"."
  }
}

variable "region" {
  description = "App Platform region slug (metro-level, e.g. \"nyc\" - a different namespace than Droplet/Spaces slugs like \"nyc1\"). Verify against `doctl apps tier instance-size list`-adjacent docs before first apply if this ever needs to change."
  type        = string
}

variable "instance_size_slug" {
  description = "App Platform service instance size slug. Check `doctl apps tier instance-size list` for the current valid values before apply - DO has renamed these before."
  type        = string
}

variable "vpc_datacenter_region" {
  description = "Datacenter-level region slug for the VPC lookup (e.g. \"nyc1\") - distinct from `region` above, which is App Platform's own metro-level slug (\"nyc\"). Must match the datacenter the database and the API's droplet actually live in, or the app has no private route to the database."
  type        = string
}

variable "github_repo" {
  description = "owner/repo for the GitHub source, e.g. \"novaej/comprobify-web\""
  type        = string
}

variable "branch" {
  description = "Branch this app watches for Autodeploy (\"staging\" or \"production\") - automation-owned, see docs/deployment.md"
  type        = string
}

variable "source_dir" {
  description = "App Platform source directory - \"/\" (standalone repo, not a monorepo)"
  type        = string
  default     = "/"
}

variable "build_command" {
  description = "Must stay explicit - the buildpack's auto-detected default (`npm run build`) silently skips `prisma generate`. See docs/deployment.md's Build settings table."
  type        = string
  default     = "npm run build:deploy"
}

variable "run_command" {
  description = "Must stay explicit - runs `prisma migrate deploy` before `next start`. The build phase has no network path to the database (confirmed empirically), so migrations run at process startup instead, matching the comprobify API repo's own pattern."
  type        = string
  default     = "npm run start:deploy"
}

variable "domain_primary" {
  description = "Primary custom domain for this environment (marketing host, e.g. staging.comprobify.com)"
  type        = string
}

variable "domain_alias" {
  description = "Secondary custom domain for this environment (app host, e.g. app-staging.comprobify.com) - same app, routed by src/proxy.ts host-header logic, not a separate app"
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for comprobify.com"
  type        = string
}

variable "cloudflare_zone_name" {
  description = "The zone's bare domain, e.g. \"comprobify.com\" - used to derive each cloudflare_record's bare subdomain name from the FQDN variables above (domain_primary/domain_alias), so there's one source of truth instead of two variables that must be kept in sync."
  type        = string
  default     = "comprobify.com"
}

# --- Plain (non-secret) app-level env vars ---

variable "database_ssl" {
  description = "\"true\" to connect DATABASE_URL over TLS - RUN_TIME only, never needed at build time"
  type        = string
}

variable "comprobify_api_url" {
  type = string
}

variable "sentry_dsn" {
  description = "Not treated as SECRET - DSNs are write-only credential-adjacent values, not full credentials"
  type        = string
  default     = ""
}

variable "next_public_sentry_dsn" {
  type    = string
  default = ""
}

variable "app_env" {
  type = string
}

variable "next_public_app_env" {
  description = "Must be RUN_AND_BUILD_TIME, not just BUILD_TIME - gets inlined into the client bundle at build time AND read server-side at request time by src/lib/seo.ts's robots.ts/sitemap.ts"
  type        = string
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
  type = string
}

variable "next_public_app_url" {
  type = string
}

# --- Secret app-level env vars - values injected via TF_VAR_ in CI, never in tfvars ---

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
  description = "Full PEM content of the DO Postgres cluster's CA cert - RUN_TIME only, never needed at build time"
  type        = string
  sensitive   = true
  default     = ""
}

variable "sentry_auth_token" {
  description = "BUILD_TIME only - used solely by the Sentry webpack/turbopack plugin during `next build`, never read at runtime"
  type        = string
  sensitive   = true
  default     = ""
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

# ADMIN_SEED_PASSWORD is deliberately NOT a variable here - it's never read at runtime by
# Next.js, only passed inline when running prisma/seed.js manually. Adding it as a
# persistent App Platform env var would be a regression from the current (correct) setup.
