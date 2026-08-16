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
  description = "DigitalOcean droplet region slug, e.g. \"nyc1\" - must match where the shared database and the comprobify API repo's own droplet actually live"
  type        = string
  default     = "nyc1"
}

variable "droplet_size" {
  description = "DigitalOcean droplet size slug. Start on the cheapest tier (\"s-1vcpu-512mb-10gb\", ~$4/mo) to validate the migration before resizing - see terraform/modules/droplet/cloud-init.yaml.tftpl for the swap-file mitigation while on this tier."
  type        = string
  default     = "s-1vcpu-512mb-10gb"
}

variable "ssh_public_key" {
  description = "Public half of this droplet's dedicated infra SSH key, literal OpenSSH-format content - not a path, and not the comprobify API repo's own key. Safe to commit; confers no access alone."
  type        = string
}

variable "deploy_username" {
  description = "Unprivileged Linux deploy user for this droplet - deliberately distinct from the comprobify API repo's own deploy_username."
  type        = string
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
