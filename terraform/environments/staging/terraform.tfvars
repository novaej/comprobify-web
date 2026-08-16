# Non-secret values only. Secrets are supplied exclusively via TF_VAR_* in CI
# (see .github/workflows/terraform.yml) - never add a secret value to this file.

region       = "nyc1" # where the shared database and the API's own droplet actually live
droplet_size = "s-1vcpu-1gb" # resized from s-1vcpu-512mb-10gb after SSH connection resets under load

# Paste the PUBLIC half's content of a dedicated, staging-only SSH key
# (ssh-keygen -t ed25519 -C "comprobify-web-deploy-staging" -f ~/.ssh/comprobify_web_deploy_staging).
# Deliberately per-environment, unlike the comprobify API repo (which reuses one key
# pair across staging and production - see its terraform-digitalocean-setup.md step
# 11, "repeat steps 3-10" skips the keygen step). A shared key means a leaked
# staging INFRA_SSH_PRIVATE_KEY also unlocks production; generate a second,
# distinct key pair when environments/production is provisioned instead of
# reusing this one. This is the literal key content, safe to commit - a public
# key confers no access on its own.
ssh_public_key = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIKmcrrShvlDi9HBxiBDL9jx8pFG0hcfC/okvEohvprs comprobify-web-deploy-staging"

# Deliberately not a guessable name like "deploy"/"admin"/"ubuntu", and deliberately
# distinct from the comprobify API repo's own deploy_username ("cpfydeploy9x").
# Change this before first apply if you'd rather pick your own - just keep
# .github/workflows/deploy-staging.yml's `username:` fields in sync with it.
deploy_username = "cpfywebdeploy9x"

domain_primary = "staging.comprobify.com"
domain_alias   = "app-staging.comprobify.com"

# Same zone the comprobify API repo's Terraform already uses - see its own
# terraform.tfvars for the value.
cloudflare_zone_id = "7d75cca935a373030ac39b7f1ba7696c"
