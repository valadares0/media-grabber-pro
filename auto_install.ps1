param(
    [switch]$OnDefault
)

$ErrorActionPreference = "Continue"
$ExtDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ExtDir) {
    $ExtDir = "C:\Users\kerci\Documents\antigravity\media-grabber-extension"
}
$LogFile = Join-Path $ExtDir "install_log.txt"

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public class Win32Desktop {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr GetThreadDesktop(uint dwThreadId);

    [DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool GetUserObjectInformationW(IntPtr hObj, int nIndex, StringBuilder pvInfo, int nLength, out int lpnLengthNeeded);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern IntPtr GetDlgItem(IntPtr hDlg, int nIDDlgItem);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr SendMessageW(IntPtr hWnd, uint Msg, IntPtr wParam, string lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr SendMessageW(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern bool PostMessageW(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    public static void ForceForeground(IntPtr hWnd) {
        IntPtr fg = GetForegroundWindow();
        uint fgThread = GetWindowThreadProcessId(fg, IntPtr.Zero);
        uint curThread = GetCurrentThreadId();
        if (fgThread != 0 && fgThread != curThread) {
            AttachThreadInput(curThread, fgThread, true);
            ShowWindow(hWnd, 3);
            BringWindowToTop(hWnd);
            SetForegroundWindow(hWnd);
            AttachThreadInput(curThread, fgThread, false);
        } else {
            ShowWindow(hWnd, 3);
            BringWindowToTop(hWnd);
            SetForegroundWindow(hWnd);
        }
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct STARTUPINFO {
        public int cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public int dwX; public int dwY; public int dwXSize; public int dwYSize;
        public int dwXCountChars; public int dwYCountChars; public int dwFillAttribute;
        public int dwFlags; public short wShowWindow; public short cbReserved2;
        public IntPtr lpReserved2; public IntPtr hStdInput; public IntPtr hStdOutput; public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PROCESS_INFORMATION {
        public IntPtr hProcess;
        public IntPtr hThread;
        public int dwProcessId;
        public int dwThreadId;
    }

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CreateProcessW(
        string lpApplicationName,
        string lpCommandLine,
        IntPtr lpProcessAttributes,
        IntPtr lpThreadAttributes,
        bool bInheritHandles,
        uint dwCreationFlags,
        IntPtr lpEnvironment,
        string lpCurrentDirectory,
        ref STARTUPINFO lpStartupInfo,
        out PROCESS_INFORMATION lpProcessInformation
    );

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

    public static string GetCurrentDesktopName() {
        IntPtr hDesk = GetThreadDesktop(GetCurrentThreadId());
        StringBuilder sb = new StringBuilder(256);
        int needed;
        if (GetUserObjectInformationW(hDesk, 2, sb, sb.Capacity * 2, out needed)) {
            return sb.ToString();
        }
        return "";
    }

    public static int RunOnDefaultDesktop(string cmdLine, bool wait) {
        STARTUPINFO si = new STARTUPINFO();
        si.cb = Marshal.SizeOf(si);
        si.lpDesktop = "WinSta0\\Default";
        si.dwFlags = 1;
        si.wShowWindow = 0;
        PROCESS_INFORMATION pi;
        if (!CreateProcessW(null, cmdLine, IntPtr.Zero, IntPtr.Zero, false, 0, IntPtr.Zero, null, ref si, out pi)) {
            return -1;
        }
        if (wait) {
            WaitForSingleObject(pi.hProcess, 60000);
        }
        return pi.dwProcessId;
    }
}
"@

$deskName = [Win32Desktop]::GetCurrentDesktopName()
if (-not $OnDefault -and $deskName -ne "Default") {
    if (Test-Path $LogFile) { Remove-Item $LogFile -Force }
    $psExe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    $scriptPath = $MyInvocation.MyCommand.Path
    $cmd = "`"$psExe`" -NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -OnDefault"
    [Win32Desktop]::RunOnDefaultDesktop($cmd, $true) | Out-Null
    if (Test-Path $LogFile) {
        Get-Content $LogFile
        Remove-Item $LogFile -Force -ErrorAction SilentlyContinue
    }
    exit 0
}

function Log($msg) {
    $line = "[$(Get-Date -Format 'HH:mm:ss')] $msg"
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
    Write-Host $line
}

if (Test-Path $LogFile) { Remove-Item $LogFile -Force }
Log "Iniciando instalador automatico Media Grabber Pro v4.5..."

# 1. Register Chrome Native Messaging Host (auto-spawns Local Engine on demand anytime)
$nativeManifestPath = Join-Path $ExtDir "js\com.mediagrabber.engine.json"
$nativeBatPath = Join-Path $ExtDir "js\native_host.bat"
try {
    $origins = @("chrome-extension://piomkgcddbnbcnmgljeehodljpkfdhpi/")
    $chromePrefs = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data\Default\Secure Preferences"
    if (Test-Path $chromePrefs) {
        $prefsJson = Get-Content $chromePrefs -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($prefsJson -and $prefsJson.extensions -and $prefsJson.extensions.settings) {
            foreach ($prop in $prefsJson.extensions.settings.PSObject.Properties) {
                $extPath = $prop.Value.path
                if ($extPath -and ($extPath.TrimEnd('\') -ieq $ExtDir.TrimEnd('\'))) {
                    $origin = "chrome-extension://$($prop.Name)/"
                    if ($origins -notcontains $origin) { $origins += $origin }
                }
            }
        }
    }
    $nmObj = [ordered]@{
        name = "com.mediagrabber.engine"
        description = "Media Grabber Pro Local High-Speed Video Engine"
        path = $nativeBatPath
        type = "stdio"
        allowed_origins = $origins
    }
    $nmJson = $nmObj | ConvertTo-Json -Depth 4
    Set-Content -Path $nativeManifestPath -Value $nmJson -Encoding UTF8
    $nmKey = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.mediagrabber.engine"
    if (-not (Test-Path $nmKey)) {
        New-Item -Path $nmKey -Force | Out-Null
    }
    Set-ItemProperty -Path $nmKey -Name "(Default)" -Value $nativeManifestPath -Force
    Log "Native Messaging Host registrado no Chrome com sucesso ($nativeBatPath)."
} catch {}

# 2. Start / Upgrade Local High-Speed Media Engine Server (yt-dlp + ejs + ffmpeg) on 127.0.0.1:48721
$engineScript = Join-Path $ExtDir "js\media_engine_server.js"
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$nodeExe = if ($nodeCmd) { $nodeCmd.Source } else { "C:\Program Files\nodejs\node.exe" }
if ((Test-Path $nodeExe) -and (Test-Path $engineScript)) {
    $vbsPath = Join-Path $ExtDir "js\start_engine_silent.vbs"
    $vbsContent = "Set WshShell = CreateObject(""WScript.Shell"")`r`nWshShell.Run """"""$nodeExe"""" """"$engineScript"""""" , 0, False"
    Set-Content -Path $vbsPath -Value $vbsContent -Encoding ASCII
    try {
        $runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
        Set-ItemProperty -Path $runKey -Name "MediaGrabberProEngine" -Value "wscript.exe `"$vbsPath`"" -ErrorAction SilentlyContinue
    } catch {}

    $needStart = $true
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:48721/api/health" -TimeoutSec 1 -ErrorAction Stop
        if ($health.version -eq "4.5") {
            Log "Motor local Media Engine v4.5 ja ativo na porta 48721."
            $needStart = $false
        } else {
            Log "Atualizando Motor Local para v4.5..."
            Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -match "media_engine_server" } | ForEach-Object { Invoke-CimMethod -InputObject $_ -MethodName Terminate | Out-Null }
            Start-Sleep -Milliseconds 400
        }
    } catch {}

    if ($needStart) {
        Log "Iniciando Motor Local de Video v4.5 (YouTube/Kids/Lives/Shorts) em segundo plano..."
        Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
            CommandLine = "wscript.exe `"$vbsPath`""
        } | Out-Null
        Start-Sleep -Milliseconds 900
    }
}

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms

$chromeExe = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chromeExe)) {
    $chromeExe = "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
}

$chromeProcs = Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
if (-not $chromeProcs) {
    Start-Process $chromeExe -ArgumentList "--force-renderer-accessibility"
    Start-Sleep -Seconds 3
    $chromeProcs = Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
}

$targetHwnd = [IntPtr]::Zero
foreach ($p in $chromeProcs) {
    if ($p.MainWindowTitle -match "Extens") {
        $targetHwnd = $p.MainWindowHandle
        break
    }
}
if ($targetHwnd -eq [IntPtr]::Zero) {
    $targetHwnd = $chromeProcs[0].MainWindowHandle
}

[Win32Desktop]::ForceForeground($targetHwnd)
Start-Sleep -Milliseconds 400

$winEl = [System.Windows.Automation.AutomationElement]::FromHandle($targetHwnd)

function Find-El($root, $nameRegex, $ctrlType = $null) {
    $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($el in $all) {
        if ($el.Current.Name -match $nameRegex) {
            if (-not $ctrlType -or $el.Current.ControlType.ProgrammaticName -eq $ctrlType) {
                return $el
            }
        }
    }
    return $null
}

# Switch to existing Extensões tab if open, or navigate to chrome://extensions
if ($winEl.Current.Name -notmatch "Extens") {
    $extTab = Find-El $winEl "^Extens" "ControlType.TabItem"
    if ($extTab) {
        $selPat = $null
        $invPat = $null
        if ($extTab.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$selPat)) {
            $selPat.Select()
            Start-Sleep -Milliseconds 700
        } elseif ($extTab.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$invPat)) {
            $invPat.Invoke()
            Start-Sleep -Milliseconds 700
        }
    }
}

if ($winEl.Current.Name -notmatch "Extens") {
    $omni = Find-El $winEl "Barra de pesquisa|Barra de endere|Address and search bar" "ControlType.Edit"
    if ($omni) {
        $omni.SetFocus()
        Start-Sleep -Milliseconds 150
    } else {
        [Win32Desktop]::ForceForeground($targetHwnd)
        [System.Windows.Forms.SendKeys]::SendWait("^l")
        Start-Sleep -Milliseconds 200
    }
    [System.Windows.Forms.Clipboard]::SetText("chrome://extensions")
    [System.Windows.Forms.SendKeys]::SendWait("^a^v{ENTER}")
    Start-Sleep -Seconds 2
}

# 0. If currently inside an Extension Error subview, clear errors and go back
$clearBtn = Find-El $winEl "^Limpar tudo$|^Clear all$" "ControlType.Button"
if ($clearBtn) {
    $invPat = $null
    if ($clearBtn.Current.IsEnabled -and $clearBtn.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$invPat)) {
        Log "Limpando registro de erros antigos..."
        $invPat.Invoke()
        Start-Sleep -Milliseconds 400
    }
    $backBtn = Find-El $winEl "^Anterior$|^Voltar$|^Back$" "ControlType.Button"
    if ($backBtn -and $backBtn.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$invPat)) {
        $invPat.Invoke()
        Start-Sleep -Milliseconds 600
    }
}

# 1. Ensure Developer Mode is ON
$devBtn = Find-El $winEl "^Modo de programador$|^Modo do desenvolvedor$|^Developer mode$" "ControlType.Button"
if ($devBtn) {
    $togglePat = $null
    if ($devBtn.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$togglePat)) {
        if ($togglePat.Current.ToggleState -eq [System.Windows.Automation.ToggleState]::Off) {
            Log "Ativando Modo do Desenvolvedor..."
            $togglePat.Toggle()
            Start-Sleep -Milliseconds 700
        }
    }
}

# 2. Ensure Pin new extensions to toolbar is ON
$pinBtn = Find-El $winEl "Afixar novas extens|Fixar novas extens|Pin new extensions" "ControlType.Button"
if ($pinBtn) {
    $togglePat = $null
    if ($pinBtn.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$togglePat)) {
        if ($togglePat.Current.ToggleState -eq [System.Windows.Automation.ToggleState]::Off) {
            Log "Fixando extensao na barra de ferramentas..."
            $togglePat.Toggle()
            Start-Sleep -Milliseconds 400
        }
    }
}

# 3. Check if Media Grabber Pro is already installed
$existingExt = Find-El $winEl "^Media Grabber Pro$" "ControlType.Text"
if ($existingExt) {
    Log "Media Grabber Pro ja instalado! Atualizando extensao..."
    $errBtn = Find-El $winEl "^Erros$|^Errors$" "ControlType.Button"
    if ($errBtn) {
        $invPat = $null
        if ($errBtn.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$invPat)) {
            $invPat.Invoke()
            Start-Sleep -Milliseconds 600
            $clr = Find-El $winEl "^Limpar tudo$|^Clear all$" "ControlType.Button"
            if ($clr -and $clr.Current.IsEnabled -and $clr.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$invPat)) {
                $invPat.Invoke()
                Start-Sleep -Milliseconds 400
            }
            $bck = Find-El $winEl "^Anterior$|^Voltar$|^Back$" "ControlType.Button"
            if ($bck -and $bck.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$invPat)) {
                $invPat.Invoke()
                Start-Sleep -Milliseconds 600
            }
        }
    }
    $updBtn = Find-El $winEl "^Atualizar$|^Update$" "ControlType.Button"
    if ($updBtn) {
        $invPat = $null
        if ($updBtn.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$invPat)) {
            $invPat.Invoke()
            Start-Sleep -Milliseconds 900
        }
    }
} else {
    # 4. Invoke Load Unpacked and select folder via Win32 dialog messages
    $loadBtn = Find-El $winEl "^Carregar expandida$|^Carregar sem compacta|^Load unpacked$" "ControlType.Button"
    if ($loadBtn) {
        Log "Carregando pasta da extensao automaticamente..."
        $invPat = $null
        if ($loadBtn.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$invPat)) {
            $invPat.Invoke()
        }
        Start-Sleep -Milliseconds 1400

        $dlgCond = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ClassNameProperty,
            "#32770"
        )
        $dlgEl = $winEl.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $dlgCond)
        if ($dlgEl) {
            $dlgHwnd = [IntPtr]$dlgEl.Current.NativeWindowHandle
            $editHwnd = [Win32Desktop]::GetDlgItem($dlgHwnd, 1152)
            $btnHwnd = [Win32Desktop]::GetDlgItem($dlgHwnd, 1)

            [Win32Desktop]::SendMessageW($editHwnd, 0x000C, [IntPtr]::Zero, $ExtDir) | Out-Null
            [Win32Desktop]::SendMessageW($dlgHwnd, 0x0111, [IntPtr]::new((0x0300 -shl 16) -bor 1152), $editHwnd) | Out-Null
            Start-Sleep -Milliseconds 250
            [Win32Desktop]::PostMessageW($btnHwnd, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
            Start-Sleep -Milliseconds 1200

            $dlgStill = $winEl.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $dlgCond)
            if ($dlgStill) {
                [Win32Desktop]::PostMessageW($btnHwnd, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
                Start-Sleep -Milliseconds 1200
            }
        }
    }
}

# 5. Final Verification
$verified = Find-El $winEl "Media Grabber Pro" $null
$remainingErr = Find-El $winEl "^Erros$|^Errors$" "ControlType.Button"
if ($verified -and -not $remainingErr) {
    Log "SUCESSO: Media Grabber Pro atualizado, ativo e SEM ERROS no Chrome!"
} elseif ($verified) {
    Log "SUCESSO: Media Grabber Pro ativo no Chrome!"
} else {
    Log "AVISO: Verifique a janela do Chrome."
}

