import { execFile } from "child_process";

export type MonitorInfo = {
  index: number;
  width: number;
  height: number;
  primary: boolean;
  name: string;
};

const PS_SCRIPT =
  "Add-Type -AssemblyName System.Windows.Forms;" +
  "$names = @();" +
  "try {" +
  "  $names = @(Get-CimInstance -Namespace root\\wmi -ClassName WmiMonitorID -ErrorAction Stop | ForEach-Object {" +
  "    ($_.UserFriendlyName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) -join ''" +
  "  })" +
  "} catch {}" +
  "$i = 0;" +
  "[System.Windows.Forms.Screen]::AllScreens | ForEach-Object {" +
  "  $name = if ($i -lt $names.Count -and $names[$i]) { $names[$i] } else { '' };" +
  "  \"$($_.Bounds.Width)|$($_.Bounds.Height)|$($_.Primary)|$name\";" +
  "  $i++" +
  "}";

export function listMonitors(): Promise<MonitorInfo[]> {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", PS_SCRIPT],
      { windowsHide: true },
      (err, stdout) => {
        if (err) {
          resolve([]);
          return;
        }
        const monitors = stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line, index) => {
            const [width, height, primary, name] = line.split("|");
            return {
              index,
              width: Number(width),
              height: Number(height),
              primary: primary === "True",
              name: name ?? "",
            };
          });
        resolve(monitors);
      },
    );
  });
}
