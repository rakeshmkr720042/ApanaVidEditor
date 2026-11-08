// Apna Editor input helper (Windows), for Smart annotate during a screen recording.
//
// Reports, as text lines on stdout, where the mouse is, when a mouse button goes down or up, and keyboard
// shortcuts. Plain typing is never reported: letters, digits and symbols only together with Ctrl, Alt or the
// Windows key; on their own only Esc, Enter, Tab, Delete, Print Screen and F1-F12.
//
//   m X Y              mouse moved (physical screen pixels)
//   d L|R|M X Y        button down
//   u L|R|M X Y        button up
//   k Ctrl+Shift+S     a shortcut
//   w L T R B          the recorded window's edges (when a window handle was given), "w gone" when it closed
//
// It stops when the app closes its input or sends "q". Built in CI with the .NET Framework compiler
// (C# 5, see .github/workflows/windows.yml) into electron/bin/inputhook.exe.
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

static class InputHook
{
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X; public int Y; }
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out RECT r);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out RECT r, int size);

    static volatile bool quit;

    static bool Down(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }

    static string KeyName(int vk)
    {
        if (vk >= 0x41 && vk <= 0x5A) return ((char)vk).ToString();
        if (vk >= 0x30 && vk <= 0x39) return ((char)vk).ToString();
        if (vk >= 0x70 && vk <= 0x7B) return "F" + (vk - 0x6F);
        if (vk >= 0x60 && vk <= 0x69) return "Num" + (vk - 0x60);
        switch (vk)
        {
            case 0x08: return "Backspace";
            case 0x09: return "Tab";
            case 0x0D: return "Enter";
            case 0x1B: return "Esc";
            case 0x20: return "Space";
            case 0x21: return "PgUp";
            case 0x22: return "PgDn";
            case 0x23: return "End";
            case 0x24: return "Home";
            case 0x25: return "←";
            case 0x26: return "↑";
            case 0x27: return "→";
            case 0x28: return "↓";
            case 0x2C: return "PrtSc";
            case 0x2D: return "Insert";
            case 0x2E: return "Delete";
            case 0x6A: return "*";
            case 0x6B: return "+";
            case 0x6D: return "-";
            case 0x6E: return ".";
            case 0x6F: return "/";
            case 0xBA: return ";";
            case 0xBB: return "=";
            case 0xBC: return ",";
            case 0xBD: return "-";
            case 0xBE: return ".";
            case 0xBF: return "/";
            case 0xC0: return "`";
            case 0xDB: return "[";
            case 0xDC: return "\\";
            case 0xDD: return "]";
            case 0xDE: return "'";
        }
        return null;
    }

    /** Keys that are shown even without Ctrl / Alt / Win. */
    static bool ShownAlone(int vk)
    {
        return vk == 0x1B || vk == 0x0D || vk == 0x09 || vk == 0x2E || vk == 0x2C || (vk >= 0x70 && vk <= 0x7B);
    }

    static void Main(string[] args)
    {
        try { if (!SetProcessDpiAwarenessContext(new IntPtr(-4))) SetProcessDPIAware(); }
        catch (Exception) { try { SetProcessDPIAware(); } catch (Exception) { } }

        IntPtr hwnd = IntPtr.Zero;
        long h;
        if (args.Length > 0 && long.TryParse(args[0], out h)) hwnd = new IntPtr(h);

        Thread reader = new Thread(delegate ()
        {
            try
            {
                string line;
                while ((line = Console.In.ReadLine()) != null) { if (line.Trim() == "q") break; }
            }
            catch (Exception) { }
            quit = true;
        });
        reader.IsBackground = true;
        reader.Start();

        StreamWriter output = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
        output.AutoFlush = false;

        int lastX = int.MinValue, lastY = int.MinValue;
        int[] buttons = { 0x01, 0x02, 0x04 };
        string[] names = { "L", "R", "M" };
        bool[] pressed = new bool[3];
        bool[] keyDown = new bool[256];
        string lastRect = "";
        long tick = 0;

        // keys already held when we start are not reported
        for (int vk = 8; vk < 256; vk++) keyDown[vk] = Down(vk);

        while (!quit)
        {
            StringBuilder sb = new StringBuilder();
            POINT p;
            if (GetCursorPos(out p) && (p.X != lastX || p.Y != lastY))
            {
                lastX = p.X; lastY = p.Y;
                sb.Append("m ").Append(p.X).Append(' ').Append(p.Y).Append('\n');
            }
            for (int i = 0; i < 3; i++)
            {
                bool d = Down(buttons[i]);
                if (d != pressed[i])
                {
                    pressed[i] = d;
                    sb.Append(d ? "d " : "u ").Append(names[i]).Append(' ').Append(lastX).Append(' ').Append(lastY).Append('\n');
                }
            }

            bool ctrl = Down(0x11), alt = Down(0x12), shift = Down(0x10), win = Down(0x5B) || Down(0x5C);
            for (int vk = 8; vk < 256; vk++)
            {
                if (vk == 0x10 || vk == 0x11 || vk == 0x12 || vk == 0x5B || vk == 0x5C || (vk >= 0xA0 && vk <= 0xA5)) continue;
                bool d = Down(vk);
                if (d && !keyDown[vk])
                {
                    string name = KeyName(vk);
                    if (name != null && (ctrl || alt || win || ShownAlone(vk)))
                    {
                        sb.Append("k ");
                        if (ctrl) sb.Append("Ctrl+");
                        if (alt) sb.Append("Alt+");
                        if (shift) sb.Append("Shift+");
                        if (win) sb.Append("Win+");
                        sb.Append(name).Append('\n');
                    }
                }
                keyDown[vk] = d;
            }

            if (hwnd != IntPtr.Zero && tick % 15 == 0)
            {
                string s;
                if (!IsWindow(hwnd)) s = "w gone";
                else
                {
                    RECT r;
                    // the visible edges, without the invisible resize border Windows 10/11 adds
                    if (DwmGetWindowAttribute(hwnd, 9, out r, Marshal.SizeOf(typeof(RECT))) != 0) GetWindowRect(hwnd, out r);
                    s = "w " + r.Left + " " + r.Top + " " + r.Right + " " + r.Bottom;
                }
                if (s != lastRect) { lastRect = s; sb.Append(s).Append('\n'); }
            }

            if (sb.Length > 0)
            {
                try { output.Write(sb.ToString()); output.Flush(); }
                catch (Exception) { return; }
            }
            tick++;
            Thread.Sleep(15);
        }
    }
}
