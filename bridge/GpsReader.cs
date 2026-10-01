// Lector de la ruta del GPS de ETS2 en memoria — SOLO LECTURA.
// Abre el juego únicamente con PROCESS_VM_READ | PROCESS_QUERY_LIMITED_INFORMATION (lo que permite TruckersMP):
// sin escritura, sin inyección y sin depuración. Las direcciones se encuentran por patrones (AOB) en el código.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace XitoTelemetryBridge;

public static class GpsReader
{
    const uint PROCESS_VM_READ = 0x0010, PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool ReadProcessMemory(IntPtr h, ulong addr, byte[] buf, UIntPtr size, out UIntPtr read);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    [DllImport("psapi.dll", SetLastError = true)] static extern bool EnumProcessModulesEx(IntPtr h, [Out] ulong[] mods, uint cb, out uint needed, uint filter);
    [DllImport("psapi.dll", CharSet = CharSet.Unicode)] static extern uint GetModuleBaseNameW(IntPtr h, ulong mod, StringBuilder name, uint size);
    [StructLayout(LayoutKind.Sequential)] struct MODULEINFO { public ulong Base; public uint Size; public ulong Entry; }
    [DllImport("psapi.dll")] static extern bool GetModuleInformation(IntPtr h, ulong mod, out MODULEINFO mi, uint cb);

    // Patrones y offsets (ETS2 1.61.1.1). Se pueden actualizar desde el HUB sin nueva versión.
    public static string AobGlobal = "48 8B 35 ?? ?? ?? ?? 49 8B DF 48 85 F6 74 ?? 48 8B 06 48 8B CE 44 8B 35";
    public static string AobNav = "48 81 C3 ?? ?? ?? ?? 0F 84 ?? ?? ?? ?? BA 01 00 00 00 48 8B CF E8";
    public static string AobRoute = "48 8B 01 48 8B D9 FF 50 20 84 C0 74 ?? 48 8B 53 ?? 48 8D 4B ?? 48 85 D2 48 8D 42 ?? 48 0F 44 C1";
    public static int SubOffset = 0x8, ItemSize = 48;
    public static volatile bool Enabled = true;

    static IntPtr h = IntPtr.Zero; static int pid; static ulong mbase;
    static ulong globalRva; static uint navOff; static int holderOff, fallbackOff, arrayOff;
    static string lastSig = "";

    public static void Loop(Action<object> emit)
    {
        while (true)
        {
            try
            {
                if (!Enabled) { Detach(); Thread.Sleep(2000); continue; }
                if (h == IntPtr.Zero && !Attach(emit)) { Thread.Sleep(5000); continue; }
                var pts = ReadRoute(out ulong arr, out ulong count, out float d0);
                string sig = $"{arr}|{count}|{d0:F0}";
                if (sig != lastSig)
                {
                    lastSig = sig;
                    var flat = new List<double>(pts.Count * 2);
                    foreach (var p in pts) { flat.Add(Math.Round(p.x, 1)); flat.Add(Math.Round(p.z, 1)); }
                    emit(new { t = "gps", pts = flat, dist = d0, count });
                }
                Thread.Sleep(1000);
            }
            catch { Detach(); Thread.Sleep(3000); }
        }
    }

    static void Detach() { if (h != IntPtr.Zero) { CloseHandle(h); h = IntPtr.Zero; } lastSig = ""; }

    static bool Attach(Action<object> emit)
    {
        var procs = System.Diagnostics.Process.GetProcessesByName("eurotrucks2");
        if (procs.Length == 0) return false;
        pid = procs[0].Id;
        h = OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
        if (h == IntPtr.Zero) return false;
        var mods = new ulong[1024];
        if (!EnumProcessModulesEx(h, mods, (uint)(mods.Length * 8), out uint need, 0x3)) { Detach(); return false; }
        mbase = 0;
        for (int i = 0; i < need / 8 && i < mods.Length; i++)
        {
            var sb = new StringBuilder(260); GetModuleBaseNameW(h, mods[i], sb, 260);
            if (sb.ToString().Equals("eurotrucks2.exe", StringComparison.OrdinalIgnoreCase)) { mbase = mods[i]; break; }
        }
        if (mbase == 0) { Detach(); return false; }
        if (!Resolve()) { emit(new { t = "gpsstatus", ok = false, msg = "Esta versión del juego no es compatible todavía con la lectura del GPS" }); Detach(); Thread.Sleep(60000); return false; }
        emit(new { t = "gpsstatus", ok = true, msg = "Leyendo la ruta del GPS del juego" });
        return true;
    }

    // Busca los tres patrones en la sección .text del ejecutable (solo lectura)
    static bool Resolve()
    {
        uint pe = U32(mbase + 0x3C);
        ushort nsec = BitConverter.ToUInt16(Read(mbase + pe + 6, 2) ?? new byte[2], 0);
        ushort opt = BitConverter.ToUInt16(Read(mbase + pe + 20, 2) ?? new byte[2], 0);
        ulong sec = mbase + pe + 24 + opt;
        uint trva = 0, tsize = 0;
        for (int i = 0; i < nsec; i++)
        {
            var s = Read(sec + (ulong)(i * 40), 40); if (s == null) continue;
            if (Encoding.ASCII.GetString(s, 0, 5) == ".text") { tsize = BitConverter.ToUInt32(s, 8); trva = BitConverter.ToUInt32(s, 12); break; }
        }
        if (tsize == 0) return false;
        // Se lee la sección por trozos y se busca cada patrón; debe aparecer exactamente una vez
        var text = new byte[tsize];
        const int chunk = 1 << 20;
        for (uint off = 0; off < tsize; off += chunk)
        {
            uint n = Math.Min(chunk, tsize - off);
            var b = Read(mbase + trva + off, (int)n);
            if (b != null) Buffer.BlockCopy(b, 0, text, (int)off, (int)n);
        }
        int g = FindUnique(text, AobGlobal), nv = FindUnique(text, AobNav), r = FindUnique(text, AobRoute);
        if (g < 0 || nv < 0 || r < 0) return false;
        globalRva = (ulong)(trva + g + 7 + BitConverter.ToInt32(text, g + 3));
        navOff = BitConverter.ToUInt32(text, nv + 3);
        holderOff = text[r + 16]; fallbackOff = text[r + 20]; arrayOff = text[r + 27];
        return navOff > 0 && navOff < 0x100000;
    }

    static int FindUnique(byte[] data, string pattern)
    {
        var toks = pattern.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var pat = new int[toks.Length];
        for (int i = 0; i < toks.Length; i++) pat[i] = toks[i] == "??" ? -1 : Convert.ToInt32(toks[i], 16);
        int found = -1, hits = 0, first = pat[0];
        for (int i = 0; i <= data.Length - pat.Length; i++)
        {
            if (first >= 0 && data[i] != first) continue;
            bool ok = true;
            for (int j = 1; j < pat.Length; j++) if (pat[j] >= 0 && data[i + j] != pat[j]) { ok = false; break; }
            if (ok) { found = i; if (++hits > 1) return -1; }
        }
        return hits == 1 ? found : -1;
    }

    struct P { public double x, z; }

    static List<P> ReadRoute(out ulong arr, out ulong count, out float d0)
    {
        var res = new List<P>(); arr = 0; count = 0; d0 = 0;
        ulong obj = U64(mbase + globalRva);
        if (obj == 0) return res;
        ulong sub = obj + navOff + (ulong)SubOffset;
        ulong holder = U64(sub + (ulong)holderOff);
        arr = holder != 0 ? holder + (ulong)arrayOff : sub + (ulong)fallbackOff;
        ulong data = U64(arr + 8); count = U64(arr + 0x10);
        if (data == 0 || count == 0 || count > 50000) { count = 0; return res; }
        var blob = Read(data, (int)count * ItemSize);
        if (blob == null) { count = 0; return res; }
        d0 = BitConverter.ToSingle(blob, 0x24);
        for (int i = 0; i < (int)count; i++)
        {
            int o = i * ItemSize;
            uint kind = BitConverter.ToUInt32(blob, o); int idx = BitConverter.ToInt32(blob, o + 4);
            ulong ptr = BitConverter.ToUInt64(blob, o + 8);
            P? p = kind == 0 ? Node(ptr) : kind == 1 ? Prefab(ptr, idx) : null;
            if (p.HasValue && Math.Abs(p.Value.x) < 400000 && Math.Abs(p.Value.z) < 400000) res.Add(p.Value);
        }
        return res;
    }

    static P? Node(ulong ptr)
    {
        var b = Read(ptr, 12); if (b == null) return null;
        return new P { x = BitConverter.ToInt32(b, 0) / 256.0, z = BitConverter.ToInt32(b, 8) / 256.0 };
    }

    // Curva de navegación dentro de un prefab (cruces, rotondas): posición local rotada y desplazada
    static P? Prefab(ulong item, int idx)
    {
        if (idx < 0) return null;
        ulong desc = U64(U64(item + 0x90) + 0xF0); if (desc == 0) return null;
        ulong rec = desc + U32(desc + 0x5C) + (ulong)idx * 0xBC;
        var hdr = Read(rec, 3); if (hdr == null) return null;
        int nid = hdr[1] | (hdr[2] << 8);
        ulong lp = hdr[0] == 0 ? desc + U32(desc + 0x30) + (ulong)nid * 0x68 + 0x10 : desc + U32(desc + 0x34) + (ulong)nid * 0x84 + 0x1C;
        var loc = Read(lp, 12); var pl = Read(item + 0x130, 32);
        if (loc == null || pl == null) return null;
        double lx = BitConverter.ToSingle(loc, 0), ly = BitConverter.ToSingle(loc, 4), lz = BitConverter.ToSingle(loc, 8);
        double px = BitConverter.ToSingle(pl, 0), pz = BitConverter.ToSingle(pl, 8);
        short sx = BitConverter.ToInt16(pl, 12), sz = BitConverter.ToInt16(pl, 14);
        double qw = BitConverter.ToSingle(pl, 16), qx = BitConverter.ToSingle(pl, 20), qy = BitConverter.ToSingle(pl, 24), qz = BitConverter.ToSingle(pl, 28);
        double tx = 2 * (qy * lz - qz * ly), ty = 2 * (qz * lx - qx * lz), tz = 2 * (qx * ly - qy * lx);
        double rx = lx + qw * tx + (qy * tz - qz * ty);
        double rz = lz + qw * tz + (qx * ty - qy * tx);
        return new P { x = sx * 512.0 + px + rx, z = sz * 512.0 + pz + rz };
    }

    static byte[] Read(ulong addr, int size)
    {
        if (addr == 0 || size <= 0 || h == IntPtr.Zero) return null;
        var buf = new byte[size];
        return ReadProcessMemory(h, addr, buf, (UIntPtr)size, out UIntPtr n) && (int)n == size ? buf : null;
    }
    static ulong U64(ulong a) { var b = Read(a, 8); return b == null ? 0 : BitConverter.ToUInt64(b, 0); }
    static uint U32(ulong a) { var b = Read(a, 4); return b == null ? 0 : BitConverter.ToUInt32(b, 0); }
}
