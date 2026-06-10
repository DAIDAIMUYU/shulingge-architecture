import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { CredentialRecord, CredentialStore } from "./types.js";

const execFileAsync = promisify(execFile);

export class InMemoryCredentialStore implements CredentialStore {
  private readonly values = new Map<string, string>();

  async get(record: Omit<CredentialRecord, "password">): Promise<string | null> {
    return this.values.get(this.toKey(record.service, record.account)) ?? null;
  }

  async set(record: CredentialRecord): Promise<void> {
    this.values.set(this.toKey(record.service, record.account), record.password);
  }

  async delete(record: Omit<CredentialRecord, "password">): Promise<boolean> {
    return this.values.delete(this.toKey(record.service, record.account));
  }

  private toKey(service: string, account: string): string {
    return `${service}::${account}`;
  }
}

export class WindowsCredentialStore implements CredentialStore {
  async get(record: Omit<CredentialRecord, "password">): Promise<string | null> {
    const script = buildCredentialScript("get", {
      service: record.service,
      account: record.account,
    });
    const { stdout } = await execFileAsync("powershell.exe", powerShellArgs(script));
    const trimmed = stdout.trim();
    return trimmed ? trimmed : null;
  }

  async set(record: CredentialRecord): Promise<void> {
    const script = buildCredentialScript("set", record);
    await execFileAsync("powershell.exe", powerShellArgs(script));
  }

  async delete(record: Omit<CredentialRecord, "password">): Promise<boolean> {
    const script = buildCredentialScript("delete", {
      service: record.service,
      account: record.account,
    });
    const { stdout } = await execFileAsync("powershell.exe", powerShellArgs(script));
    return stdout.trim() === "1";
  }
}

export function createSystemCredentialStore(): CredentialStore {
  if (process.platform === "win32") {
    return new WindowsCredentialStore();
  }

  throw new Error(`Unsupported platform for system credential manager: ${process.platform}`);
}

function powerShellArgs(script: string): string[] {
  return [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
  ];
}

function psString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildCredentialScript(
  operation: "get" | "set" | "delete",
  record: Partial<CredentialRecord> & { service: string; account: string },
): string {
  const passwordLine =
    operation === "set" ? `$password = ${psString(record.password ?? "")}` : "$password = ''";

  return `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class NativeCredentialBridge {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public uint Flags;
    public uint Type;
    public string TargetName;
    public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }

  [DllImport("Advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredWrite([In] ref CREDENTIAL userCredential, [In] uint flags);

  [DllImport("Advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredRead(string target, uint type, int reservedFlag, out IntPtr credentialPtr);

  [DllImport("Advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredDelete(string target, uint type, int flags);

  [DllImport("Advapi32.dll", SetLastError = true)]
  public static extern void CredFree([In] IntPtr cred);
}
"@

$service = ${psString(record.service)}
$account = ${psString(record.account)}
${passwordLine}
$target = "$service|$account"
$credentialType = 1

switch (${psString(operation)}) {
  'set' {
    $credential = New-Object NativeCredentialBridge+CREDENTIAL
    $credential.Type = $credentialType
    $credential.TargetName = $target
    $credential.UserName = $account
    $credential.Persist = 2

    $bytes = [Text.Encoding]::Unicode.GetBytes($password)
    $credential.CredentialBlobSize = $bytes.Length
    $credential.CredentialBlob = [Runtime.InteropServices.Marshal]::StringToCoTaskMemUni($password)

    try {
      if (-not [NativeCredentialBridge]::CredWrite([ref]$credential, 0)) {
        throw [ComponentModel.Win32Exception]::new([Runtime.InteropServices.Marshal]::GetLastWin32Error())
      }
    } finally {
      if ($credential.CredentialBlob -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeCoTaskMemUnicode($credential.CredentialBlob)
      }
    }
    break
  }
  'get' {
    $credentialPtr = [IntPtr]::Zero
    if (-not [NativeCredentialBridge]::CredRead($target, $credentialType, 0, [ref]$credentialPtr)) {
      $last = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
      if ($last -eq 1168) {
        return
      }
      throw [ComponentModel.Win32Exception]::new($last)
    }

    try {
      $credential = [Runtime.InteropServices.Marshal]::PtrToStructure($credentialPtr, [type]'NativeCredentialBridge+CREDENTIAL')
      if ($credential.CredentialBlobSize -gt 0) {
        $secret = [Runtime.InteropServices.Marshal]::PtrToStringUni($credential.CredentialBlob, [int]($credential.CredentialBlobSize / 2))
        [Console]::Out.Write($secret)
      }
    } finally {
      if ($credentialPtr -ne [IntPtr]::Zero) {
        [NativeCredentialBridge]::CredFree($credentialPtr)
      }
    }
    break
  }
  'delete' {
    if ([NativeCredentialBridge]::CredDelete($target, $credentialType, 0)) {
      [Console]::Out.Write('1')
      break
    }
    $last = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    if ($last -eq 1168) {
      [Console]::Out.Write('0')
      break
    }
    throw [ComponentModel.Win32Exception]::new($last)
  }
}
`;
}
