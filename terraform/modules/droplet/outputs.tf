output "droplet_ip" {
  description = "Ephemeral public IPv4 address of the droplet itself — changes on any replacement (destroy/recreate, or a ForceNew attribute change like editing cloud-init). Do not use this for DNS or CD pipeline secrets (DROPLET_IP); use reserved_ip instead."
  value       = digitalocean_droplet.this.ipv4_address
}

output "reserved_ip" {
  description = "Stable public IPv4 address (DigitalOcean Reserved IP) — survives droplet destroy/recreate cycles, since it's a separate resource re-pointed at the new droplet rather than recreated itself. Use this for DNS (already wired via cloudflare_record.primary/alias) and for the DROPLET_IP GitHub Secret used by the CD pipeline's SSH steps."
  value       = digitalocean_reserved_ip.this.ip_address
}

output "droplet_id" {
  description = "DigitalOcean droplet ID"
  value       = digitalocean_droplet.this.id
}

output "project_id" {
  description = "DigitalOcean Project ID this droplet was assigned to"
  value       = data.digitalocean_project.this.id
}

output "dns_records" {
  description = "Fully-qualified DNS records created for this droplet"
  value = {
    primary = cloudflare_record.primary.hostname
    alias   = cloudflare_record.alias.hostname
  }
}
