$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root ".test-dist"
$aliasRoot = Join-Path $dist "node_modules\@"
$aliasLib = Join-Path $aliasRoot "lib"

if (Test-Path $dist) {
  Remove-Item -LiteralPath $dist -Recurse -Force
}

Push-Location $root
try {
  node (Join-Path $root "node_modules\typescript\bin\tsc") -p tsconfig.test.json
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  New-Item -ItemType Directory -Force -Path $aliasRoot | Out-Null
  Set-Content -LiteralPath (Join-Path $dist "package.json") -Value '{ "type": "commonjs" }'
  Copy-Item -LiteralPath (Join-Path $dist "lib") -Destination $aliasLib -Recurse

  $testFiles = Get-ChildItem -LiteralPath (Join-Path $dist "tests") -Recurse -Filter "*.test.js" |
    ForEach-Object { $_.FullName }

  node --test $testFiles
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}
finally {
  Pop-Location
}
