Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = 'C:\Projects\TubePilot'
$zipPath = Join-Path $root 'TubePilot.zip'
$storePath = Join-Path $root 'TubePilot-store.zip'

# Remove old zips
Remove-Item $zipPath -ErrorAction SilentlyContinue
Remove-Item $storePath -ErrorAction SilentlyContinue

# Folders and files to exclude
$excludeDirs = @('.git', '.claude', 'node_modules', 'docs', 'store-assets')
$excludeFiles = @('ROADMAP.md', 'REACTIONS-PLAN.md', 'TASKS.md', 'package.json', 'package-lock.json', 'TubePilot.zip', 'TubePilot-store.zip', 'build-zip.ps1', 'build-for-store.ps1', 'fix-icons.js', '.gitignore')
$excludeExts = @('.txt', '.md')

# Collect files
$allFiles = Get-ChildItem -Path $root -Recurse -File
$included = @()

foreach ($f in $allFiles) {
    $rel = $f.FullName.Substring($root.Length + 1)

    # Skip excluded directories
    $skip = $false
    foreach ($d in $excludeDirs) {
        if ($rel.StartsWith($d + '\') -or $rel -eq $d) { $skip = $true; break }
    }
    if ($skip) { continue }

    # Skip excluded files
    if ($excludeFiles -contains $rel) { continue }
    if ($excludeFiles -contains $f.Name) { continue }

    # Skip excluded extensions
    if ($excludeExts -contains $f.Extension) { continue }

    $included += $rel
}

Write-Host "Including $($included.Count) files:"
$included | ForEach-Object { Write-Host "  $_" }

# Create zip with correct relative paths
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
foreach ($rel in $included) {
    $fullPath = Join-Path $root $rel
    $entryName = $rel -replace '\\', '/'
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $fullPath, $entryName, 'Optimal') | Out-Null
}
$zip.Dispose()

# Copy for store version
Copy-Item $zipPath $storePath

$size = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host "`n--- Done ---"
Write-Host "Size: $size MB"

# Verify by listing entries
Write-Host "`nZip entries (first 10):"
$verify = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$verify.Entries | Select-Object -First 10 | ForEach-Object { Write-Host "  $($_.FullName)" }
$verify.Dispose()
