variable "environment" {
  description = "Environment name: \"staging\" or \"production\""
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be \"staging\" or \"production\"."
  }
}

variable "region" {
  description = "DigitalOcean region slug, e.g. \"nyc1\" - must match where the shared database and the comprobify API's own droplet actually live, or this app has no fast/private route to the database"
  type        = string
}

variable "droplet_size" {
  description = "DigitalOcean droplet size slug, e.g. \"s-1vcpu-512mb-10gb\""
  type        = string
}

variable "image_slug" {
  description = "DigitalOcean base OS image slug. Deliberately a plain distribution image, not a Marketplace app image (e.g. the Docker-preinstalled one) - several Marketplace images require more disk than the cheapest droplet tiers provide. Docker is installed via cloud-init instead; see cloud-init.yaml.tftpl. Mirrors comprobify/terraform/modules/droplet's own choice."
  type        = string
  default     = "ubuntu-24-04-x64"
}

variable "ssh_public_key" {
  description = "Public half of the dedicated infra SSH key for this droplet, as its literal OpenSSH-format content - not a path, and not the comprobify API repo's own key (kept separate so a leaked credential in one repo doesn't require rotating the other's). A public key confers no access on its own, so it's safe to commit in terraform.tfvars."
  type        = string
}

variable "deploy_username" {
  description = "Unprivileged Linux user created on the droplet for SSH access (personal and CD alike) - deliberately not root, and deliberately not a guessable name like \"deploy\"/\"admin\"/\"ubuntu\", and deliberately not the comprobify API repo's own deploy_username. Granted docker group membership only, no sudo; see cloud-init.yaml.tftpl."
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for comprobify.com"
  type        = string
}

variable "cloudflare_zone_name" {
  description = "The zone's bare domain, e.g. \"comprobify.com\" - used to derive each cloudflare_record's bare subdomain name from the FQDN variables below, so there's one source of truth instead of two variables that must be kept in sync. Mirrors the old app-platform module's own variable of the same name."
  type        = string
  default     = "comprobify.com"
}

variable "domain_primary" {
  description = "Primary custom domain for this environment (marketing host, e.g. staging.comprobify.com)"
  type        = string
}

variable "domain_alias" {
  description = "Secondary custom domain for this environment (app host, e.g. app-staging.comprobify.com) - same droplet/container, routed by src/proxy.ts host-header logic, not a separate deployment"
  type        = string
}
