# terraform/variables.tf
# ==============================================================
# Input variable declarations for the AI Recipe Generator infra.
# Set values in terraform.tfvars (never commit that file) or
# pass them on the command line:
#   terraform apply -var="key_pair_name=my-key"
# ==============================================================

variable "aws_region" {
  description = "AWS region where all resources will be created."
  type        = string
  default     = "us-east-1"
}

variable "app_name" {
  description = "Short name for the application, used to prefix resource names and tags."
  type        = string
  default     = "ai-recipe-generator"
}

variable "environment" {
  description = "Deployment environment label (e.g. production, staging)."
  type        = string
  default     = "production"
}

variable "instance_type" {
  description = "EC2 instance type. t3.micro is free-tier eligible; upgrade to t3.small+ for production traffic."
  type        = string
  default     = "t3.micro"
}

variable "key_pair_name" {
  description = "Name of an existing EC2 key pair in the target region. Required for SSH access."
  type        = string
  # No default – must be supplied in terraform.tfvars or via -var flag
}

variable "ssh_allowed_cidr" {
  description = "CIDR block allowed to SSH into the server. Restrict to your IP (e.g. 203.0.113.42/32) for security."
  type        = string
  default     = "0.0.0.0/0"   # Change this to your IP before applying!
}
