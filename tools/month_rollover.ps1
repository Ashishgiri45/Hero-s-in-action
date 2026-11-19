# Month rollover: copy last month's master workbook to a new file and make the new month live.
#   - last month's column in Dealer_Vol1 / Dealer_Val1 / Dealer-MBD1 is frozen (values, subtotals too)
#   - a column is inserted INSIDE the month ranges, so every Total / L3M / YTD / KPI Config range grows by itself
#   - the new month's column gets the live formulas (dealer rows) and zone / grand-total subtotals
#   - MBD target base (MBD Avg L3M) moves to the 3 months before the new month
#   - SE Dashboard B2 (month start) and B3 (data date) = 1st of the new month
# .\month_rollover.ps1 -Src "<...OCT-26.xlsx>" -Dst "<...NOV-26.xlsx>" -Month 2026-11-01 -MbdSub mbd_sub_formula.txt
param([string]$Src, [string]$Dst, [datetime]$Month, [string]$MbdSub)
$ErrorActionPreference = 'Stop'
function Retry($__f) { for ($__k = 0; $__k -lt 240; $__k++) { try { return & $__f } catch { if ("$_" -match '0x8001010A|0x80010001') { Start-Sleep -Milliseconds 500 } else { throw } } }; throw 'Excel stayed busy' }
function ColL($n) { $s = ''; while ($n -gt 0) { $m = ($n - 1) % 26; $s = [char](65 + $m) + $s; $n = [int](($n - $m - 1) / 26) }; $s }
if (Test-Path -LiteralPath $Dst) { throw "$Dst already exists - not overwriting it." }
Copy-Item -LiteralPath $Src -Destination $Dst
$mbdTpl = (Get-Content -Raw -Encoding UTF8 $MbdSub).Trim()
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false; $xl.AskToUpdateLinks = $false; $xl.EnableEvents = $false
try {
  $wb = $xl.Workbooks.Open($Dst, 0, $false)
  try { $wb.AutoSaveOn = $false } catch {}
  $xl.Calculation = -4135
  $prevLbl = $Month.AddMonths(-1).ToString('MMM-yy'); $lbl = $Month.ToString('MMM-yy')
  foreach ($sheet in @('Dealer_Vol1', 'Dealer_Val1', 'Dealer-MBD1')) {
    $ws = $wb.Worksheets.Item($sheet)
    $col = 0; for ($c = 11; $c -le 90; $c++) { $v = $ws.Cells(1, $c).Value2; if ($v -is [double] -and [DateTime]::FromOADate($v).ToString('MMM-yy') -eq $prevLbl) { $col = $c } }
    if (-not $col) { throw "$sheet : no $prevLbl column" }
    $last = $ws.Cells($ws.Rows.Count, 1).End(-4162).Row                    # last labelled row (Grand Total)
    $old = $ws.Range($ws.Cells(2, $col), $ws.Cells($last, $col)); Retry { $old.Value2 = $old.Value2 } | Out-Null   # freeze last month fully
    Retry { $ws.Columns($col).Insert() } | Out-Null                          # inside the ranges -> they grow
    Retry { $ws.Columns($col + 1).Copy($ws.Columns($col)) } | Out-Null     # last month (values) back in place
    $n = $col + 1; $L = ColL $n
    $ws.Cells(1, $n).Value2 = $Month.ToOADate()
    $colA = $ws.Range("A2:A$last").Value2; $colE = $ws.Range("E2:E$last").Value2   # 1-based object[,]: read with GetValue
    $helper = ''
    if ($sheet -eq 'Dealer_Vol1') { for ($c = $n + 1; $c -le 120; $c++) { if ("$($ws.Cells(1, $c).Formula)" -like "*'KPI Config'!`$D`$14*") { $helper = ColL $c; break } }; if (-not $helper) { throw 'Dealer_Vol1: month helper column not found' } }
    $tpl = switch ($sheet) {   # written to a whole block at once: Excel shifts the row numbers like a fill-down
      'Dealer_Vol1' { '=$' + $helper + '{r}' }
      'Dealer_Val1' { "=SUMIFS(Billing!`$K:`$K,Billing!`$A:`$A,`$E{r},Billing!`$AC:`$AC,'KPI Config'!`$D`$14)" }
      'Dealer-MBD1' { "=LET(c,COUNTIF(Index!`$N`$2:`$N`$20000,`$E{r}),IF(c=0,`"`",c))" } }
    $start = 2; $subs = @(); $blk = $null
    $flush = { param($a0, $b0) if ($a0) { $rg = $ws.Range($ws.Cells($a0, $n), $ws.Cells($b0, $n)); Retry { $rg.Formula2 = $tpl.Replace('{r}', "$a0") } | Out-Null } }
    for ($i = 1; $i -le $last - 1; $i++) {
      $r = $i + 1; $lab = "$($colA.GetValue($i, 1))".Trim(); $code = "$($colE.GetValue($i, 1))".Trim()
      if ($code -ne '') { if (-not $blk) { $blk = $r }; continue }
      & $flush $blk ($r - 1); $blk = $null
      if ($lab -eq '') { continue }
      $cellF = if ($sheet -eq 'Dealer-MBD1') { $mbdTpl.Replace('{r}', "$r") }
               elseif ($lab -match '^grand total$') { '=' + (($subs | ForEach-Object { "$L$_" }) -join '+') }
               else { "=SUM($L$($start):$L$($r - 1))" }
      if ($sheet -ne 'Dealer-MBD1' -and $lab -notmatch '^grand total$') { $subs += $r; $start = $r + 1 } elseif ($sheet -eq 'Dealer-MBD1') { $subs += $r }
      $cl = $ws.Cells($r, $n); Retry { $cl.Formula2 = $cellF } | Out-Null
    }
    & $flush $blk $last    "$sheet : $prevLbl frozen in $(ColL $col), $lbl live in $L (rows 2..$last, subtotals $($subs -join ','))"
    if ($sheet -eq 'Dealer-MBD1') {   # MBD target base = the 3 months before the new month
      $c3 = $n - 1; $b3 = ColL ($c3 - 2); $e3 = ColL $c3; $l3 = "$($Month.AddMonths(-3).ToString('MMM'))-$($Month.AddMonths(-1).ToString('MMM'))"
      for ($c = $n + 1; $c -le 120; $c++) {
        $h = "$($ws.Cells(1, $c).Value2)"
        if ($h -like 'MBD Avg L3M*') {
          $ws.Cells(1, $c).Value2 = "MBD Avg L3M ($l3)"
          $fr = $ws.Range($ws.Cells(2, $c), $ws.Cells($last, $c)); $ff = $fr.Formula
          for ($i = 1; $i -le $last - 1; $i++) { if ("$($ff.GetValue($i, 1))" -like '=*AVERAGE(*') { $ff.SetValue("=IFERROR(AVERAGE($b3$($i + 1):$e3$($i + 1)),`"`")", $i, 1) } }
          Retry { $fr.Formula = $ff } | Out-Null; "  MBD Avg L3M -> $b3..$e3 ($l3)"
        } elseif ($h -like 'L3M (*') { $ws.Cells(1, $c).Value2 = "L3M ($l3)" }
      }
    }
  }
  $sd = $wb.Worksheets.Item('SE Dashboard'); $sd.Range('B2').Value2 = $Month.ToOADate(); $sd.Range('B3').Value2 = $Month.ToOADate()
  "SE Dashboard B2 = B3 = $($Month.ToString('dd-MMM-yyyy'))"
  $xl.Calculation = -4105
  Retry { $xl.CalculateFull() } | Out-Null
  Retry { $wb.Save() } | Out-Null; 'saved'
  Retry { $wb.Close($false) } | Out-Null
} finally { $xl.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl) }
