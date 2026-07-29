# Non-secret values only. Secrets are supplied exclusively via TF_VAR_* in CI
# (see .github/workflows/terraform.yml) - never add a secret value to this file.

region             = "nyc"
instance_size_slug = "basic-xxs" # cheapest tier, $5/mo - doctl apps tier instance-size list

github_repo    = "novaej/comprobify-web"
domain_primary = "staging.comprobify.com"
domain_alias   = "app-staging.comprobify.com"

# Same zone the comprobify API repo's Terraform already uses - see its own
# terraform.tfvars for the value.
cloudflare_zone_id = "7d75cca935a373030ac39b7f1ba7696c"

database_ssl       = "true"
comprobify_api_url = "https://api-staging.comprobify.com"

app_env             = "staging"
next_public_app_env = "staging"

next_public_marketing_url = "https://staging.comprobify.com"
next_public_app_url       = "https://app-staging.comprobify.com"

sentry_dsn             = "https://dda17234977e8471d407795aaa6672e1@o4511524451385344.ingest.us.sentry.io/4511524532256768"
next_public_sentry_dsn = "https://dda17234977e8471d407795aaa6672e1@o4511524451385344.ingest.us.sentry.io/4511524532256768"

mailgun_domain = "mg.comprobify.com"
mailgun_from   = "Comprobify <no-reply@mg.comprobify.com>"

support_email = "support@comprobify.com"
support_phone = "+593 963839195"
