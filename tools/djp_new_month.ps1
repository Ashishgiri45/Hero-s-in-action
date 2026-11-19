# Adds an empty DJP block for the new month to 'MTD DJP SUMMARY MONTH WISE' (copy of last month's
# 26-column block, retitled, dates set, data cleared) and registers it in KPI Config's DJP block map.
# .\djp_new_month.ps1 -Workbook "<...NOV-26.xlsx>" -Month 2026-11-01
param([string]$Workbook, [datetime]$Month)
$ErrorActionPreference = 'Stop'
function Retry($__f) { for ($__k = 0; $__k -lt 240; $__k++) { try { return & $__f } catch { if ("$_" -match '0x8001010A|0x80010001') { Start-Sleep -Milliseconds 500 } else { throw } } }; throw 'Excel stayed busy' }
function ColL($n) { $s = ''; while ($n -gt 0) { $m = ($n - 1) % 26; $s = [char](65 + $m) + $s; $n = [int](($n - $m - 1) / 26) }; $s }
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false; $xl.AskToUpdateLinks = $false; $xl.EnableEvents = $false
try {
  $wb = $xl.Workbooks.Open($Workbook, 0, $false)
  try { $wb.AutoSaveOn = $false } catch {}
  $xl.Calculation = -4135
  $dj = $wb.Worksheets.Item('MTD DJP SUMMARY MONTH WISE'); $cfg = $wb.Worksheets.Item('KPI Config')
  $prevName = $Month.AddMonths(-1).ToString('MMMM').ToUpper(); $name = $Month.ToString('MMMM').ToUpper(); $yr = $Month.ToString('yyyy')
  $src = 0; for ($c = 1; $c -le 400; $c++) { $t = "$($dj.Cells(1, $c).Value2)"; if ($t -like "$prevName $yr*") { $src = $c; break } }
  if (-not $src) { throw "No $prevName $yr block in row 1" }
  for ($c = 1; $c -le 400; $c++) { if ("$($dj.Cells(1, $c).Value2)" -like "$name $yr*") { throw "$name $yr block already exists" } }
  $dst = $src + 26; $lastRow = $dj.Cells($dj.Rows.Count, $src + 1).End(-4162).Row
  $srcR = $dj.Range($dj.Cells(1, $src), $dj.Cells($lastRow, $src + 25)); $dstR = $dj.Range($dj.Cells(1, $dst), $dj.Cells($lastRow, $dst + 25))
  Retry { $srcR.Copy($dstR) } | Out-Null
  for ($c = $dst; $c -le $dst + 25; $c++) {
    for ($r = 1; $r -le 2; $r++) { $v = "$($dj.Cells($r, $c).Value2)"; if ($v -like "*$prevName*") { $dj.Cells($r, $c).Value2 = $v.Replace($prevName, $name) } }
    if ("$($dj.Cells(3, $c).Value2)" -eq 'Start Date') { $dj.Cells(3, $c + 1).Formula = "$([int]$Month.ToOADate())"; $dj.Cells(4, $c + 1).Formula = "$([int]$Month.AddMonths(1).AddDays(-1).ToOADate())" }   # serial dates (cells keep their date format)
    if ($lastRow -ge 7) { $dj.Range($dj.Cells(7, $c), $dj.Cells($lastRow, $c)).ClearContents() | Out-Null }   # data rows: pasted each day
    $v5 = $dj.Cells(5, $c).Value2; if ($v5 -is [double]) { $dj.Cells(5, $c).ClearContents() | Out-Null }            # last month's totals
  }
  # ASM / SE block first columns of the new block (title cells in row 2)
  $aCol = 0; $sCol = 0; for ($c = $dst; $c -le $dst + 25; $c++) { $t = "$($dj.Cells(2, $c).Value2)"; if ($t -like '*ASM WISE*') { $aCol = $c }; if ($t -match '\bR?SE WISE') { $sCol = $c } }
  "DJP: $name $yr block in $(ColL $dst)..$(ColL ($dst + 25)) (ASM block $(ColL $aCol), SE block $(ColL $sCol)), rows 7..$lastRow cleared"
  # KPI Config block map: insert the new month as the row above 'Current month (CUR_MONTH) block'
  $cur = $cfg.Range('A1:A200').Find('Current month (CUR_MONTH) block', [Type]::Missing, -4163, 1); if (-not $cur) { throw 'KPI Config: DJP block map not found' }
  $cr = $cur.Row; $first = $cr - 1; while ("$($cfg.Cells($first - 1, 4).Formula)" -like '=DATE(*') { $first-- }
  Retry { $cfg.Rows($cr).Insert() } | Out-Null; $nr = $cr; $cr++
  $q = "'MTD DJP SUMMARY MONTH WISE'!"
  $cfg.Cells($nr, 1).Formula = "=$q`$$(ColL ($aCol + 1))`$3"; $cfg.Cells($nr, 2).Formula = "=COLUMN($q`$$(ColL ($aCol + 1))`$3)-1"
  $cfg.Cells($nr, 3).Formula = "=COLUMN($q`$$(ColL ($sCol + 1))`$3)-1"; $cfg.Cells($nr, 4).Formula = "=DATE(YEAR(`$A$nr),MONTH(`$A$nr),1)"
  $cfg.Range("A$($nr - 1):D$($nr - 1)").Copy() | Out-Null; $cfg.Range("A$($nr):D$($nr)").PasteSpecial(-4122) | Out-Null; try { $xl.CutCopyMode = 1; $xl.CutCopyMode = [Type]::Missing } catch {}   # same formats
  $cfg.Cells($cr, 2).Formula = "=INDEX(`$B`$$($first):`$B`$$($nr),MATCH(CUR_MONTH,`$D`$$($first):`$D`$$($nr),0))"
  $cfg.Cells($cr, 3).Formula = "=INDEX(`$C`$$($first):`$C`$$($nr),MATCH(CUR_MONTH,`$D`$$($first):`$D`$$($nr),0))"
  "KPI Config: map row $nr added; current-month lookup now rows $first..$nr"
  $xl.Calculation = -4105
  Retry { $xl.CalculateFull() } | Out-Null
  Retry { "check: CUR block cols = $($cfg.Cells($cr, 2).Text) / $($cfg.Cells($cr, 3).Text); SE Dashboard D7:F7 = $($wb.Worksheets.Item('SE Dashboard').Range('D7:F7').Value2 -join ', ')" }
  Retry { $wb.Save() } | Out-Null; 'saved'
  Retry { $wb.Close($false) } | Out-Null
} finally { $xl.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl) }
