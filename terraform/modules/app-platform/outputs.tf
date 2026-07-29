output "app_id" {
  description = "DigitalOcean App Platform app ID - useful for `doctl apps` lookups"
  value       = digitalocean_app.this.id
}

output "default_ingress" {
  description = "App Platform's own *.ondigitalocean.app hostname - the CNAME target both custom domains point at"
  value       = digitalocean_app.this.default_ingress
}

output "live_url" {
  description = "Primary custom domain URL"
  value       = "https://${var.domain_primary}"
}
