# A new release for winget (microsoft/winget-pkgs): the manifests of this version from the templates next to this
# script, with the address and SHA256 of the installer just published, sent as a pull request by Microsoft's own
# tool (wingetcreate) from the owner's fork of winget-pkgs. Runs in release.yml after the release is published.
#   -Tag v1.0.1   the release tag
# Environment: WINGET_TOKEN (the owner's classic token, public_repo scope), GH_TOKEN (to read the release),
# GITHUB_REPOSITORY, RUNNER_TEMP (set by GitHub Actions).
param([Parameter(Mandatory)] [string] $Tag)
$ErrorActionPreference = 'Stop'

$version = $Tag.TrimStart('v')
$file = "AITU-Desk_${version}_x64-setup.exe"
$url = "https://github.com/$env:GITHUB_REPOSITORY/releases/download/$Tag/$file"

# The hash of the file people will download, read from the published release itself.
gh release download $Tag --repo $env:GITHUB_REPOSITORY --pattern $file --dir $env:RUNNER_TEMP --clobber
if ($LASTEXITCODE -ne 0) { throw "The release $Tag has no $file" }
$sha = (Get-FileHash -LiteralPath (Join-Path $env:RUNNER_TEMP $file) -Algorithm SHA256).Hash

$dir = Join-Path $env:RUNNER_TEMP "manifests\c\cyberbara01\AITUDesk\$version"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$values = @{
  '{{version}}' = $version
  '{{tag}}' = $Tag
  '{{url}}' = $url
  '{{sha256}}' = $sha
  '{{date}}' = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')
}
$utf8 = New-Object System.Text.UTF8Encoding $false
foreach ($template in Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.yaml.template') {
  $text = [IO.File]::ReadAllText($template.FullName, $utf8)
  foreach ($key in $values.Keys) { $text = $text.Replace($key, $values[$key]) }
  if ($text.Contains('{{')) { throw "$($template.Name) has a value left unfilled" }
  [IO.File]::WriteAllText((Join-Path $dir ($template.Name -replace '\.template$', '')), $text.Replace("`r`n", "`n"), $utf8)
}
Get-ChildItem -LiteralPath $dir | ForEach-Object { "== $($_.Name)"; Get-Content -LiteralPath $_.FullName }

# Microsoft's tool, taken only when Microsoft's signature on it is valid.
$exe = Join-Path $env:RUNNER_TEMP 'wingetcreate.exe'
Invoke-WebRequest -Uri 'https://aka.ms/wingetcreate/latest' -OutFile $exe
$sig = Get-AuthenticodeSignature -LiteralPath $exe
if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
  throw "wingetcreate.exe is not signed by Microsoft ($($sig.Status))"
}
& $exe submit --prtitle "New version: cyberbara01.AITUDesk version $version" --token $env:WINGET_TOKEN $dir
if ($LASTEXITCODE -ne 0) { throw "wingetcreate exited with $LASTEXITCODE" }
