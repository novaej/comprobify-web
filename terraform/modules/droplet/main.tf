terraform {
  required_providers {
    digitalocean = { source = "digitalocean/digitalocean" }
    cloudflare   = { source = "cloudflare/cloudflare" }
    http         = { source = "hashicorp/http" }
  }
}

resource "digitalocean_ssh_key" "infra" {
  name       = "comprobify-web-infra-${var.environment}"
  public_key = var.ssh_public_key
}

resource "digitalocean_droplet" "this" {
  name     = "comprobify-web-${var.environment}"
  region   = var.region
  size     = var.droplet_size
  image    = var.image_slug
  ssh_keys = [digitalocean_ssh_key.infra.id]

  # Explicit false, overriding the provider's own default of true - a resize that also
  # grows the disk can never be undone (DigitalOcean allows disk to grow but never shrink,
  # regardless of this flag), so a future size change here would permanently ratchet up
  # disk usage/cost even if the CPU/RAM change was only meant to be a temporary test.
  # false keeps size changes limited to CPU/RAM only, freely reversible in both directions.
  # Mirrors comprobify/terraform/modules/droplet exactly.
  resize_disk = false

  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    environment     = var.environment
    deploy_username = var.deploy_username
    ssh_public_key  = var.ssh_public_key
  })
}

# Deliberately NOT created with droplet_id set inline (the resource supports that, but
# doing so makes this resource implicitly depend on digitalocean_droplet.this). Kept as
# its own free-standing, region-scoped resource plus a separate
# digitalocean_reserved_ip_assignment below, so that a droplet replacement (any "ForceNew"
# attribute change, e.g. user_data/cloud-init edits, or an SSH key rotation) only ever
# touches the assignment, never this resource - the IP itself survives, and only needs
# re-pointing at the new droplet id, not re-provisioning or re-registering in DNS/GitHub
# Secrets. Free of charge as long as it stays assigned to a droplet.
resource "digitalocean_reserved_ip" "this" {
  region = var.region

  lifecycle {
    ignore_changes = [droplet_id]
  }
}

resource "digitalocean_reserved_ip_assignment" "this" {
  ip_address = digitalocean_reserved_ip.this.ip_address
  droplet_id = digitalocean_droplet.this.id
}

# Cloudflare's published IPv4 ranges, fetched live instead of hardcoded - avoids the
# firewall silently going stale if Cloudflare ever changes the list. See
# https://www.cloudflare.com/ips-v4
data "http" "cloudflare_ipv4" {
  url = "https://www.cloudflare.com/ips-v4"
}

locals {
  cloudflare_ipv4_ranges = compact(split("\n", data.http.cloudflare_ipv4.response_body))
}

resource "digitalocean_firewall" "this" {
  name        = "comprobify-web-${var.environment}-fw"
  droplet_ids = [digitalocean_droplet.this.id]

  # 80/443 restricted to Cloudflare's IP ranges only - bypassing this by hitting the
  # droplet's raw IP directly would skip Cloudflare's proxy (and its WAF/DDoS
  # protection) entirely. This is the whole point of moving off App Platform, where no
  # equivalent restriction is possible.
  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = local.cloudflare_ipv4_ranges
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = local.cloudflare_ipv4_ranges
  }

  # SSH open to the internet, deliberately - personal access and the CD pipeline
  # (GitHub-hosted runners with no fixed IP) both need to reach it. Defense is layered
  # at the identity/privilege level instead - key-only auth, no root login, an
  # unprivileged deploy user with no sudo, fail2ban, MaxAuthTries/LoginGraceTime limits -
  # all in cloud-init.yaml.tftpl. Mirrors comprobify/terraform/modules/droplet's own
  # documented reasoning (docs/terraform-digitalocean-setup.md's "SSH access model").
  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = ["0.0.0.0/0"]
  }

  # Both protocols outbound - TCP alone would silently break DNS resolution
  # (UDP/53), which everything from `apt` to `docker pull` depends on.
  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}

# Looked up, not created/owned - the project already exists and already holds this
# app's App Platform resources (and the comprobify API droplet's own project is a
# separate one). See docs/terraform-digitalocean-setup.md in the comprobify repo for
# the full reasoning on why this is a data source, not a managed resource.
data "digitalocean_project" "this" {
  name = "Comprobify ${title(var.environment)}"
}

resource "digitalocean_project_resources" "this" {
  project = data.digitalocean_project.this.id
  resources = [
    digitalocean_droplet.this.urn,
  ]
}

# comprobify.com's DNS is hosted on Cloudflare - proxied = true this time (unlike the
# old app-platform module's cloudflare_record.primary/alias, which were forced to
# proxied = false by App Platform's own cert-verification requirements). A droplet has
# no such constraint, so both domains get Cloudflare's WAF/DDoS/bot layer.
locals {
  app_ingress_hostname = digitalocean_reserved_ip.this.ip_address
}

resource "cloudflare_record" "primary" {
  zone_id = var.cloudflare_zone_id
  name    = trimsuffix(var.domain_primary, ".${var.cloudflare_zone_name}")
  type    = "A"
  content = local.app_ingress_hostname
  proxied = true
  ttl     = 1 # required to be 1 ("automatic") when proxied = true
}

resource "cloudflare_record" "alias" {
  zone_id = var.cloudflare_zone_id
  name    = trimsuffix(var.domain_alias, ".${var.cloudflare_zone_name}")
  type    = "A"
  content = local.app_ingress_hostname
  proxied = true
  ttl     = 1
}
