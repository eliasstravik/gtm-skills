param([string]$Mode, [string]$StatePath)
$ErrorActionPreference = 'Stop'
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$item = Get-Item -LiteralPath $StatePath -Force
if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse point refused' }
$acl = Get-Acl -LiteralPath $StatePath
if ($Mode -eq 'protect') {
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($rule in @($acl.Access)) { [void]$acl.RemoveAccessRuleSpecific($rule) }
  $inheritance = if ($item.PSIsContainer) { [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit' } else { [Security.AccessControl.InheritanceFlags]::None }
  $rule = [Security.AccessControl.FileSystemAccessRule]::new($identity, [Security.AccessControl.FileSystemRights]::FullControl, $inheritance, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow)
  $acl.AddAccessRule($rule)
  $acl.SetOwner($identity)
  Set-Acl -LiteralPath $StatePath -AclObject $acl
  $acl = Get-Acl -LiteralPath $StatePath
}
$trusted = @($identity.Value, 'S-1-5-18', 'S-1-5-32-544')
$owner = $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
if ($owner -notin $trusted) { throw 'Unexpected owner' }
foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
  if ($rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or $rule.IdentityReference.Value -in $trusted) { continue }
  if ($Mode -eq 'parent') {
    $writes = [Security.AccessControl.FileSystemRights]'Write, Delete, DeleteSubdirectoriesAndFiles, ChangePermissions, TakeOwnership'
    if (($rule.FileSystemRights -band $writes) -eq 0) { continue }
  }
  throw 'State accessible by another user'
}
