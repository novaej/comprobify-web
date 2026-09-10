variable "do_token" {
  description = "DigitalOcean API token, dedicated to this repo's pipeline (comprobify-web-terraform-production) - not reused from staging's token or from the comprobify API repo's own token, so a leak in one scope doesn't require rotating the others. Supply via TF_VAR_do_token, never in a committed file."
  type        = string
  sensitive   = true
}

variable "cloudflare_token" {
  description = "Cloudflare API token, scoped to the comprobify.com zone, dedicated to this repo's pipeline. Supply via TF_VAR_cloudflare_token, never in a committed file."
  type        = string
  sensitive   = true
}

variable "region" {
  description = "DigitalOcean droplet region slug, e.g. \"nyc1\" - must match where the production database and the comprobify API repo's own production droplet actually live"
  type        = string
  default     = "nyc1"
}

variable "droplet_size" {
  description = "DigitalOcean droplet size slug. Starts at staging's already-validated \"s-1vcpu-1gb\" rather than re-running the cheaper-tier trial production went through - resize later if real usage demands it."
  type        = string
  default     = "s-1vcpu-1gb"
}

variable "ssh_public_key" {
  description = "Public half of this droplet's dedicated infra SSH key, literal OpenSSH-format content - not a path, and not staging's or the comprobify API repo's own key. Safe to commit; confers no access alone. Generate with: ssh-keygen -t ed25519 -C \"comprobify-web-deploy-production\" -f ~/.ssh/comprobify_web_deploy_production"
  type        = string
}

variable "deploy_username" {
  description = "Unprivileged Linux deploy user for this droplet - deliberately distinct from staging's (cpfywebdeploy9x) and from the comprobify API repo's own production deploy_username (cpfydeploy4c7a)."
  type        = string
}

variable "domain_primary" {
  type    = string
  default = "comprobify.com"
}

variable "domain_alias" {
  type    = string
  default = "app.comprobify.com"
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for comprobify.com - same zone staging's and the API repo's Terraform already use"
  type        = string
}
