param(
  [Parameter(Mandatory = $true)]
  [string]$CommitMessageFile
)

if (-not (Test-Path $CommitMessageFile)) {
  exit 0
}

$lines = Get-Content -Path $CommitMessageFile
$subject = $null
foreach ($line in $lines) {
  if (-not [string]::IsNullOrWhiteSpace($line) -and $line -notmatch '^\s*#') {
    $subject = $line.Trim()
    break
  }
}

if ($null -eq $subject) {
  exit 0
}

$pattern = '^(feat|fix|docs|refactor|test|chore|perf|build|ci|revert)(\([a-z0-9._-]+\))?: [a-z0-9].{0,71}$'
if ($subject -match $pattern) {
  exit 0
}

Write-Host ""
Write-Host "ERROR: Commit message must use the required format." -ForegroundColor Red
Write-Host "Required format: type(scope): subject" -ForegroundColor Yellow
Write-Host "Example: feat(auth): add login validation" -ForegroundColor Yellow
exit 1
