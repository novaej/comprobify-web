# Reuses the same comprobify-terraform-state Spaces bucket as the comprobify API repo,
# under its own key prefix (comprobify-web/...) - the S3 backend's `key` is what scopes
# state, so this is fully independent of the API repo's staging/terraform.tfstate despite
# sharing a bucket. Use a Spaces access key dedicated to this repo's pipeline, not the API
# repo's - that's the real credential-isolation boundary, not the bucket choice.
#
# skip_requesting_account_id/skip_s3_checksum/etc. are required against DO Spaces (or any
# non-AWS S3-compatible store) - see comprobify/terraform/environments/staging/backend.tf
# for why each flag exists (403s / checksum-header incompatibilities otherwise).
terraform {
  backend "s3" {
    endpoints = {
      s3 = "https://nyc3.digitaloceanspaces.com"
    }
    region                      = "us-east-1" # required by the S3 backend syntax, ignored by Spaces
    bucket                      = "comprobify-terraform-state"
    key                         = "comprobify-web/staging/terraform.tfstate"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
  }
}
