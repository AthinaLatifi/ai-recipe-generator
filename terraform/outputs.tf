# terraform/outputs.tf
# ==============================================================
# Output values printed after `terraform apply` completes.
# Use these to configure GitHub Actions Secrets and DNS records.
# ==============================================================

output "elastic_ip" {
  description = "Public Elastic IP address of the EC2 server. Use this as SSH_HOST in GitHub Secrets."
  value       = aws_eip.recipe_app_eip.public_ip
}

output "instance_id" {
  description = "EC2 instance ID – useful for AWS Console lookups."
  value       = aws_instance.recipe_app_server.id
}

output "instance_type" {
  description = "EC2 instance type that was provisioned."
  value       = aws_instance.recipe_app_server.instance_type
}

output "ami_id" {
  description = "AMI ID used for the instance (auto-selected Ubuntu 22.04 LTS)."
  value       = data.aws_ami.ubuntu.id
}

output "security_group_id" {
  description = "ID of the security group attached to the instance."
  value       = aws_security_group.recipe_app_sg.id
}

output "ssh_command" {
  description = "Ready-to-run SSH command to connect to your server."
  value       = "ssh -i ~/.ssh/${var.key_pair_name}.pem ubuntu@${aws_eip.recipe_app_eip.public_ip}"
}
