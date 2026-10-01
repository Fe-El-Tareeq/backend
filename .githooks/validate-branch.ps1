param(
  [Parameter(Mandatory = $false)]
  [string]$BranchName
)

if ([string]::IsNullOrWhiteSpace($BranchName)) {
  exit 0
}

$pattern = '^(feature|fix|chore|docs|refactor|test|perf|hotfix)/[a-z0-9]+(?:-[a-z0-9]+)*$'
if ($BranchName -match $pattern) {
  exit 0
}

Write-Host ""
Write-Host "ERROR: Branch name '$BranchName' does not follow the required convention." -ForegroundColor Red
Write-Host "Required format: type/short-description" -ForegroundColor Yellow
Write-Host "Allowed types: feature, fix, chore, docs, refactor, test, perf, hotfix" -ForegroundColor Yellow
Write-Host "Example: feature/login-flow" -ForegroundColor Yellow
exit 1
