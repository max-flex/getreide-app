Add-Type -AssemblyName System.Drawing

function New-WheatIcon {
  param([int]$Size, [string]$Path, [double]$SafeScale = 1.0)

  $bmp = New-Object System.Drawing.Bitmap $Size, $Size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  $bg = [System.Drawing.Color]::FromArgb(255, 10, 17, 32)     # --bg #0a1120
  $gold = [System.Drawing.Color]::FromArgb(255, 251, 191, 36) # --gold #fbbf24
  $green = [System.Drawing.Color]::FromArgb(255, 74, 222, 128) # --green #4ade80

  $g.Clear($bg)

  $center = $Size / 2.0
  $span = $Size * 0.68 * $SafeScale
  $top = $center - $span / 2.0
  $bottom = $center + $span / 2.0

  $stemW = [Math]::Max(2, $Size * 0.035)
  $stemPen = New-Object System.Drawing.Pen ([System.Drawing.SolidBrush]::new($green)), $stemW
  $stemPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $stemPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawLine($stemPen, $center, $bottom, $center, $top)

  $goldBrush = New-Object System.Drawing.SolidBrush $gold
  $grainW = $Size * 0.11 * $SafeScale
  $grainH = $Size * 0.20 * $SafeScale
  $rows = 6
  for ($i = 0; $i -lt $rows; $i++) {
    $t = $i / ($rows - 1)
    $y = $top + $t * ($bottom - $top) * 0.72
    $spread = ($Size * 0.15 * $SafeScale) * (1 - $t * 0.35)

    $g.TranslateTransform($center - $spread, $y)
    $g.RotateTransform(-25)
    $g.FillEllipse($goldBrush, -$grainW / 2, -$grainH / 2, $grainW, $grainH)
    $g.ResetTransform()

    $g.TranslateTransform($center + $spread, $y)
    $g.RotateTransform(25)
    $g.FillEllipse($goldBrush, -$grainW / 2, -$grainH / 2, $grainW, $grainH)
    $g.ResetTransform()
  }
  $g.FillEllipse($goldBrush, $center - $grainW / 2, $top - $grainH * 0.55, $grainW, $grainH)

  $dir = Split-Path -Parent $Path
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)

  $g.Dispose()
  $bmp.Dispose()
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
New-WheatIcon -Size 192 -Path (Join-Path $root "icons\icon-192.png") -SafeScale 1.0
New-WheatIcon -Size 512 -Path (Join-Path $root "icons\icon-512.png") -SafeScale 1.0
New-WheatIcon -Size 512 -Path (Join-Path $root "icons\icon-512-maskable.png") -SafeScale 0.62
New-WheatIcon -Size 180 -Path (Join-Path $root "icons\apple-touch-icon.png") -SafeScale 1.0
Write-Host "Icons erzeugt in $root\icons"
