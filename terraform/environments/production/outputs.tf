output "droplet_ip" {
  description = "Ephemeral IP - debugging only, never wire this to DNS or the DROPLET_IP GitHub Secret"
  value       = module.production.droplet_ip
}

output "reserved_ip" {
  description = "Stable IP - use this for the DROPLET_IP GitHub Secret and for manual SSH access"
  value       = module.production.reserved_ip
}

output "dns_records" {
  value = module.production.dns_records
}
