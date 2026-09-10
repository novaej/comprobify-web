# Non-secret values only. Secrets are supplied exclusively via TF_VAR_* in CI
# (see .github/workflows/terraform.yml) - never add a secret value to this file.

region       = "nyc1" # same datacenter as staging and the API's own droplet
droplet_size = "s-1vcpu-1gb"

# REPLACE before the first `terraform apply` against this environment. Generate a
# dedicated, production-only SSH key pair - never reuse staging's
# comprobify_web_deploy_staging key or the comprobify API repo's own production key:
#   ssh-keygen -t ed25519 -C "comprobify-web-deploy-production" -f ~/.ssh/comprobify_web_deploy_production
# Then paste the PUBLIC half's content below. This is the literal key content, safe
# to commit - a public key confers no access on its own. See
# docs/production-readiness-checklist.md and docs/terraform-digitalocean-setup.md's
# "SSH access model".
ssh_public_key = "REPLACE_WITH_PRODUCTION_SSH_PUBLIC_KEY"

# Deliberately not a guessable name like "deploy"/"admin"/"ubuntu", and deliberately
# distinct from staging's deploy_username ("cpfywebdeploy9x") and from the comprobify
# API repo's own production deploy_username ("cpfydeploy4c7a"). Change this before
# first apply if you'd rather pick your own - just keep
# .github/workflows/deploy-production.yml's `username:` fields in sync with it.
deploy_username = "cpfywebdeploy4c7a"

domain_primary = "comprobify.com"
domain_alias   = "app.comprobify.com"

# Same zone staging's and the comprobify API repo's Terraform already use.
cloudflare_zone_id = "7d75cca935a373030ac39b7f1ba7696c"
