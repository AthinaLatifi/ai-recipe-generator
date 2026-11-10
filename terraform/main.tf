# terraform/main.tf
# ==============================================================
# AI Recipe Generator – AWS Infrastructure (Terraform)
# ==============================================================
# Describes the EC2 instance, security group, and Elastic IP
# that host the production Flask application.
#
# NEVER run `terraform apply` without first reviewing the plan
# with `terraform plan`. All sensitive values must be supplied
# via terraform.tfvars (git-ignored) or environment variables,
# NEVER hardcoded here.
#
# Prerequisites:
#   - AWS CLI configured: `aws configure`
#   - Terraform >= 1.5 installed
#   - An existing EC2 key pair in the target AWS region
# ==============================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Recommended: store state remotely in S3 so the team shares one state file.
  # Uncomment and fill in your S3 bucket + DynamoDB table when ready.
  # backend "s3" {
  #   bucket         = "my-terraform-state-bucket"
  #   key            = "ai-recipe-generator/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "terraform-lock"
  #   encrypt        = true
  # }
}

# -----------------------------------------------------------------------------
# Provider – AWS region is set via the variable (default: us-east-1)
# -----------------------------------------------------------------------------
provider "aws" {
  region = var.aws_region
}

# -----------------------------------------------------------------------------
# Data source: look up the latest Ubuntu 22.04 LTS AMI automatically
# so the config stays up to date without manual AMI ID maintenance.
# -----------------------------------------------------------------------------
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical (official Ubuntu publisher)

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# -----------------------------------------------------------------------------
# Security Group – controls inbound/outbound traffic to the EC2 instance
# -----------------------------------------------------------------------------
resource "aws_security_group" "recipe_app_sg" {
  name        = "${var.app_name}-sg"
  description = "Security group for the ${var.app_name} Flask application"

  # Allow SSH (port 22) only from your trusted management IP.
  # Replace 0.0.0.0/0 with your own IP (e.g. "203.0.113.42/32") in tfvars
  # for better security.
  ingress {
    description = "SSH access"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_allowed_cidr]
  }

  # Allow HTTP traffic (Nginx or direct Flask)
  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow HTTPS traffic
  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow all outbound traffic (needed for pip, apt, Gemini API calls)
  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.app_name}-sg"
    Project     = var.app_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# -----------------------------------------------------------------------------
# EC2 Instance – the server that runs Flask + Gunicorn + Nginx
# -----------------------------------------------------------------------------
resource "aws_instance" "recipe_app_server" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = var.key_pair_name
  vpc_security_group_ids = [aws_security_group.recipe_app_sg.id]

  # Root volume: 20 GB is comfortable for the OS, Python venv, and app files
  root_block_device {
    volume_size           = 20
    volume_type           = "gp3"
    delete_on_termination = true

    tags = {
      Name    = "${var.app_name}-root-volume"
      Project = var.app_name
    }
  }

  # User-data script: runs once on first boot to set up the server
  user_data = <<-EOF
    #!/bin/bash
    set -euo pipefail

    # Update system packages
    apt-get update -y
    apt-get upgrade -y

    # Install Python, pip, Nginx, and Git
    apt-get install -y python3 python3-pip python3-venv nginx git

    # Create the app directory
    mkdir -p /home/ubuntu/${var.app_name}
    chown ubuntu:ubuntu /home/ubuntu/${var.app_name}

    echo "Server setup complete. Ready for deployment via GitHub Actions."
  EOF

  tags = {
    Name        = "${var.app_name}-server"
    Project     = var.app_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# -----------------------------------------------------------------------------
# Elastic IP – gives the server a static public IP that survives instance stops
# -----------------------------------------------------------------------------
resource "aws_eip" "recipe_app_eip" {
  instance = aws_instance.recipe_app_server.id
  domain   = "vpc"

  tags = {
    Name        = "${var.app_name}-eip"
    Project     = var.app_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  # Ensure the instance exists before the EIP is attached
  depends_on = [aws_instance.recipe_app_server]
}
