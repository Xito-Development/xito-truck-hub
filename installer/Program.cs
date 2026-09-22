// Instalador propio de Xito Truck Hub: ventana con el aspecto de la app que, por dentro,
// ejecuta en silencio el instalador real y enseña el progreso.
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

namespace XitoSetup
{
    static class Theme
    {
        public static readonly Color Bg = ColorTranslator.FromHtml("#0E1522");
        public static readonly Color Bg2 = ColorTranslator.FromHtml("#131C2C");
        public static readonly Color Surface = ColorTranslator.FromHtml("#172237");
        public static readonly Color Line = ColorTranslator.FromHtml("#22304a");
        public static readonly Color Text = ColorTranslator.FromHtml("#E8EDF6");
        public static readonly Color Muted = ColorTranslator.FromHtml("#8E9BB4");
        public static readonly Color Accent = ColorTranslator.FromHtml("#FFB547");
        public static readonly Color AccentInk = ColorTranslator.FromHtml("#2B1B00");
        public static Font F(float size, FontStyle st = FontStyle.Regular) => new Font("Segoe UI", size, st, GraphicsUnit.Point);
    }

    // Botón plano con esquinas redondeadas, al estilo de la app
    class XButton : Control
    {
        public bool Primary { get; set; } = true;
        bool hover, down;
        public XButton() { SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw | ControlStyles.SupportsTransparentBackColor, true); BackColor = Color.Transparent; Cursor = Cursors.Hand; Height = 44; }
        protected override void OnMouseEnter(EventArgs e) { hover = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { hover = false; down = false; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnMouseDown(MouseEventArgs e) { down = true; Invalidate(); base.OnMouseDown(e); }
        protected override void OnMouseUp(MouseEventArgs e) { down = false; Invalidate(); base.OnMouseUp(e); }
        protected override void OnPaintBackground(PaintEventArgs e) { }
        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias; g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
            PaintParentBg(this, g);
            var r = new Rectangle(0, 0, Width - 1, Height - 1);
            using (var path = Round(r, 12))
            {
                Color bg = Primary ? Theme.Accent : Theme.Surface;
                if (hover) bg = ControlPaint.Light(bg, Primary ? 0.06f : 0.25f);
                if (down) bg = ControlPaint.Dark(bg, 0.06f);
                if (!Enabled) bg = Color.FromArgb(90, bg);
                using (var b = new SolidBrush(bg)) g.FillPath(b, path);
                if (!Primary) using (var p = new Pen(Theme.Line)) g.DrawPath(p, path);
            }
            TextRenderer.DrawText(g, Text, Theme.F(10.5f, FontStyle.Bold), r, Primary ? Theme.AccentInk : Theme.Text,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
            base.OnPaint(e);
        }
        // Dibuja detrás del control el mismo fondo del formulario (transparencia real)
        public static void PaintParentBg(Control c, Graphics g)
        {
            var f = c.FindForm() as SetupForm; if (f == null) return;
            var st = g.Save();
            int ox = c.Left, oy = c.Top;
            if (c.Parent != null && c.Parent != f) { ox += c.Parent.Left; oy += c.Parent.Top; }
            g.TranslateTransform(-ox, -oy);
            f.PaintBg(g);
            g.Restore(st);
        }
        public static GraphicsPath Round(Rectangle r, int rad)
        {
            var p = new GraphicsPath(); int d = rad * 2;
            p.AddArc(r.X, r.Y, d, d, 180, 90); p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90); p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure(); return p;
        }
    }

    // Casilla propia
    class XCheck : Control
    {
        public bool Checked { get; set; }
        public string Sub { get; set; } = "";
        public XCheck() { SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw | ControlStyles.SupportsTransparentBackColor, true); BackColor = Color.Transparent; Cursor = Cursors.Hand; Height = 42; }
        protected override void OnClick(EventArgs e) { Checked = !Checked; Invalidate(); base.OnClick(e); }
        protected override void OnPaintBackground(PaintEventArgs e) { }
        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
            XButton.PaintParentBg(this, g);
            var box = new Rectangle(0, (Height - 22) / 2, 22, 22);
            using (var path = XButton.Round(box, 7))
            {
                using (var b = new SolidBrush(Checked ? Theme.Accent : Theme.Surface)) g.FillPath(b, path);
                using (var p = new Pen(Checked ? Theme.Accent : Theme.Line)) g.DrawPath(p, path);
            }
            if (Checked)
                using (var p = new Pen(Theme.AccentInk, 2.4f) { StartCap = LineCap.Round, EndCap = LineCap.Round })
                    g.DrawLines(p, new[] { new PointF(box.X + 5.5f, box.Y + 11), new PointF(box.X + 9.5f, box.Y + 15.5f), new PointF(box.X + 16.5f, box.Y + 6.5f) });
            TextRenderer.DrawText(g, Text, Theme.F(10f, FontStyle.Bold), new Rectangle(34, Sub.Length > 0 ? 2 : 0, Width - 34, Sub.Length > 0 ? 20 : Height), Theme.Text, TextFormatFlags.VerticalCenter | TextFormatFlags.Left);
            if (Sub.Length > 0)
                TextRenderer.DrawText(g, Sub, Theme.F(8.5f), new Rectangle(34, 21, Width - 34, 18), Theme.Muted, TextFormatFlags.Left | TextFormatFlags.EndEllipsis);
        }
    }

    // Barra de progreso redondeada con brillo
    class XProgress : Control
    {
        float val;
        public float Value { get { return val; } set { val = Math.Max(0, Math.Min(1, value)); Invalidate(); } }
        public XProgress() { SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw | ControlStyles.SupportsTransparentBackColor, true); BackColor = Color.Transparent; Height = 10; }
        protected override void OnPaintBackground(PaintEventArgs e) { }
        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
            XButton.PaintParentBg(this, g);
            var r = new Rectangle(0, 0, Width - 1, Height - 1);
            using (var p = XButton.Round(r, Height / 2)) using (var b = new SolidBrush(Theme.Surface)) g.FillPath(b, p);
            int w = (int)((Width - 1) * val);
            if (w > Height)
                using (var p = XButton.Round(new Rectangle(0, 0, w, Height - 1), Height / 2))
                using (var b = new LinearGradientBrush(new Rectangle(0, 0, Math.Max(w, 2), Height), Theme.Accent, ControlPaint.Light(Theme.Accent, 0.4f), 0f))
                    g.FillPath(b, p);
        }
    }

    public class SetupForm : Form
    {
        const string Magic = "XITOPKG1";
        const string AppName = "Xito Truck Hub";
        readonly bool silent, auto;
        string innerPath, installedVersion, installDir, version;
        // Todo el texto se dibuja directamente en la ventana: sin etiquetas transparentes (evita fallos del fondo)
        string title = "", sub = "", status = "", foot = "";
        bool showProgress, showFeatures = true, installing, done;
        readonly XButton go = new XButton(), later = new XButton { Primary = false }, openApp = new XButton(), close = new XButton { Primary = false };
        readonly XCheck cShortcut = new XCheck { Text = "Crear acceso directo en el escritorio", Checked = true };
        readonly XCheck cPlugin = new XCheck { Text = "Instalar el plugin de telemetría en ETS2 y ATS", Sub = "Necesario para leer tu camión", Checked = true };
        readonly XCheck cAuto = new XCheck { Text = "Iniciar con Windows", Sub = "Así registra todos tus viajes aunque olvides abrirlo", Checked = false };
        readonly System.Windows.Forms.Timer anim = new System.Windows.Forms.Timer { Interval = 30 };
        float animTarget, animVal;
        Rectangle barRect;

        public SetupForm(bool silent, bool auto)
        {
            this.silent = silent; this.auto = auto;
            Text = "Instalar " + AppName;
            FormBorderStyle = FormBorderStyle.None; StartPosition = FormStartPosition.CenterScreen;
            AutoScaleMode = AutoScaleMode.Dpi;
            ClientSize = new Size(620, 460); BackColor = Theme.Bg;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            try { Icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location); } catch { }
            Region = new Region(XButton.Round(new Rectangle(0, 0, ClientSize.Width, ClientSize.Height), 16));
            var v = Assembly.GetExecutingAssembly().GetName().Version;
            version = v == null ? "" : v.Major + "." + v.Minor + "." + v.Build;
            BuildUi();
            Detect();
            anim.Tick += (s, e) =>
            {
                float nv = animVal + (animTarget - animVal) * 0.2f;
                if (Math.Abs(animTarget - nv) < 0.004f) nv = animTarget; // llega de verdad al 100 %
                if (nv != animVal) { animVal = nv; Invalidate(new Rectangle(barRect.X, barRect.Y - 30, barRect.Width, 44)); }
            };
            anim.Start();
            if (silent) { Opacity = 0; ShowInTaskbar = false; Shown += async (s, e) => { await Run(); if (done) LaunchApp(); Close(); }; }
            // Actualización lanzada desde el HUB: se ve el instalador, empieza solo y reabre el programa
            else if (auto) Shown += async (s, e) => { await Task.Delay(600); await Run(); if (done) { await Task.Delay(1500); LaunchApp(); Close(); } };
        }

        void BuildUi()
        {
            close.SetBounds(ClientSize.Width - 46, 12, 34, 28);
            close.Paint += (s, e) =>
            {
                var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
                using (var p = new Pen(Theme.Text, 1.8f) { StartCap = LineCap.Round, EndCap = LineCap.Round }) { g.DrawLine(p, 12, 9, 22, 19); g.DrawLine(p, 22, 9, 12, 19); }
            };
            close.Click += (s, e) => { if (!installing) Close(); };
            Controls.Add(close);

            cShortcut.SetBounds(34, 118, 550, 32);
            cPlugin.SetBounds(34, 156, 550, 44);
            cAuto.SetBounds(34, 206, 550, 44);
            Controls.Add(cShortcut); Controls.Add(cPlugin); Controls.Add(cAuto);

            go.SetBounds(ClientSize.Width - 34 - 200, ClientSize.Height - 86, 200, 46); go.Text = "Instalar";
            later.SetBounds(34, ClientSize.Height - 86, 130, 46); later.Text = "Cancelar";
            openApp.SetBounds(ClientSize.Width - 34 - 240, ClientSize.Height - 86, 240, 46); openApp.Text = "Abrir " + AppName; openApp.Visible = false;
            go.Click += async (s, e) => await Run();
            later.Click += (s, e) => { if (!installing) Close(); };
            openApp.Click += (s, e) => { LaunchApp(); Close(); };
            Controls.Add(go); Controls.Add(later); Controls.Add(openApp);
            barRect = new Rectangle(34, 190, ClientSize.Width - 68, 10);
            MouseDown += Drag;
        }

        void Drag(object s, MouseEventArgs e)
        {
            if (e.Button != MouseButtons.Left) return;
            ReleaseCapture(); SendMessage(Handle, 0xA1, 0x2, 0);
        }
        [DllImport("user32.dll")] static extern int SendMessage(IntPtr h, int m, int w, int l);
        [DllImport("user32.dll")] static extern bool ReleaseCapture();

        // Fondo con degradado y una carretera sutil, como en la app (también lo usan los botones)
        public void PaintBg(Graphics g)
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using (var b = new LinearGradientBrush(new Rectangle(0, 0, ClientSize.Width, ClientSize.Height), Theme.Bg2, Theme.Bg, 60f)) g.FillRectangle(b, 0, 0, ClientSize.Width, ClientSize.Height);
            using (var b = new SolidBrush(Color.FromArgb(14, Theme.Accent)))
                g.FillPolygon(b, new[] { new Point(ClientSize.Width - 130, ClientSize.Height), new Point(ClientSize.Width - 40, 120), new Point(ClientSize.Width - 10, 120), new Point(ClientSize.Width + 90, ClientSize.Height) });
            using (var p = new Pen(Color.FromArgb(55, Theme.Accent), 3f) { DashStyle = DashStyle.Custom, DashPattern = new[] { 2f, 3f } })
                g.DrawLine(p, ClientSize.Width - 44, 140, ClientSize.Width - 70, ClientSize.Height);
        }
        protected override void OnPaintBackground(PaintEventArgs e) { }
        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
            PaintBg(g);
            // logo
            var lr = new Rectangle(34, 34, 56, 56);
            using (var p = XButton.Round(lr, 16)) using (var b = new SolidBrush(Theme.Accent)) g.FillPath(b, p);
            using (var p = new Pen(Theme.AccentInk, 2.6f) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round })
            {
                g.DrawRectangle(p, lr.X + 10, lr.Y + 18, 22, 18);
                g.DrawLines(p, new[] { new Point(lr.X + 32, lr.Y + 24), new Point(lr.X + 40, lr.Y + 24), new Point(lr.X + 46, lr.Y + 30), new Point(lr.X + 46, lr.Y + 36), new Point(lr.X + 32, lr.Y + 36) });
                g.DrawEllipse(p, lr.X + 14, lr.Y + 34, 7, 7); g.DrawEllipse(p, lr.X + 34, lr.Y + 34, 7, 7);
            }
            TextRenderer.DrawText(g, title, Theme.F(17f, FontStyle.Bold), new Rectangle(106, 36, 470, 34), Theme.Text, TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
            TextRenderer.DrawText(g, sub, Theme.F(9.5f), new Rectangle(106, 70, 480, 22), Theme.Muted, TextFormatFlags.Left | TextFormatFlags.EndEllipsis);

            if (showFeatures)
            {
                string[,] items = { { "Cabina y telemetría en directo", "Velocidad, trabajo, daños y mandos" }, { "Historial, estadísticas y mapa", "Entregas, rutas, tráfico y convoyes" }, { "Overlay en el juego y app para el móvil", "Dentro de ETS2 y desde cualquier lugar" } };
                int y0 = installedVersion != null ? 226 : 266;
                for (int i = 0; i < 3; i++)
                {
                    int y = y0 + i * 32;
                    using (var b = new SolidBrush(Theme.Accent)) g.FillEllipse(b, 38, y + 7, 7, 7);
                    TextRenderer.DrawText(g, items[i, 0], Theme.F(9.5f, FontStyle.Bold), new Point(56, y), Theme.Text);
                    TextRenderer.DrawText(g, items[i, 1], Theme.F(8.5f), new Point(56, y + 16), Theme.Muted);
                }
            }
            if (showProgress)
            {
                TextRenderer.DrawText(g, status, Theme.F(10f, FontStyle.Bold), new Rectangle(barRect.X, barRect.Y - 30, barRect.Width - 70, 24), Theme.Text, TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
                TextRenderer.DrawText(g, (int)Math.Round(animVal * 100) + " %", Theme.F(10f, FontStyle.Bold), new Rectangle(barRect.Right - 70, barRect.Y - 30, 70, 24), Theme.Accent, TextFormatFlags.Right | TextFormatFlags.VerticalCenter);
                g.SmoothingMode = SmoothingMode.AntiAlias;
                using (var p = XButton.Round(barRect, 5)) using (var b = new SolidBrush(Theme.Surface)) g.FillPath(b, p);
                int w = (int)(barRect.Width * animVal);
                if (w > 10)
                    using (var p = XButton.Round(new Rectangle(barRect.X, barRect.Y, w, barRect.Height), 5))
                    using (var b = new LinearGradientBrush(new Rectangle(barRect.X, barRect.Y, Math.Max(2, w), barRect.Height), Theme.Accent, ControlPaint.Light(Theme.Accent, 0.4f), 0f))
                        g.FillPath(b, p);
            }
            TextRenderer.DrawText(g, foot, Theme.F(8f), new Rectangle(34, ClientSize.Height - 30, 560, 20), Color.FromArgb(150, 142, 155, 180), TextFormatFlags.Left | TextFormatFlags.EndEllipsis);
            using (var p = new Pen(Theme.Line)) g.DrawPath(p, XButton.Round(new Rectangle(0, 0, ClientSize.Width - 1, ClientSize.Height - 1), 16));
        }

        // Busca la instalación anterior en las dos vistas del registro (32 y 64 bits)
        void Detect()
        {
            installedVersion = null;
            foreach (var hive in new[] { RegistryHive.LocalMachine, RegistryHive.CurrentUser })
                foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
                    try
                    {
                        using (var root = RegistryKey.OpenBaseKey(hive, view))
                        using (var k = root.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall"))
                            if (k != null)
                                foreach (var name in k.GetSubKeyNames())
                                    using (var sk = k.OpenSubKey(name))
                                    {
                                        var dn = sk?.GetValue("DisplayName") as string;
                                        if (dn != null && dn.StartsWith(AppName, StringComparison.OrdinalIgnoreCase))
                                        {
                                            installedVersion = (sk.GetValue("DisplayVersion") as string) ?? installedVersion;
                                            var loc = sk.GetValue("InstallLocation") as string;
                                            if (!string.IsNullOrEmpty(loc)) installDir = loc.Trim('"');
                                        }
                                    }
                    }
                    catch { }
            if (installedVersion != null)
            {
                title = "Actualizar " + AppName;
                sub = "Tienes la " + installedVersion + " · se instalará la " + version + " conservando todos tus datos";
                go.Text = "Actualizar";
                cShortcut.Visible = false; cPlugin.Top = 118; cAuto.Top = 168;
            }
            else { title = "Instalar " + AppName + " " + version; sub = "Tu centro de mando para Euro Truck Simulator 2 y TruckersMP"; }
            foot = "Se instalará en " + ProgramDir() + " · Xito Development · licencia MIT";
        }

        static string ProgramFiles64()
        {
            var p = Environment.GetEnvironmentVariable("ProgramW6432");
            return string.IsNullOrEmpty(p) ? Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles) : p;
        }
        string ProgramDir() => string.IsNullOrEmpty(installDir) ? Path.Combine(ProgramFiles64(), AppName) : installDir;

        async Task Run()
        {
            if (installing) return;
            installing = true; done = false;
            go.Visible = later.Visible = false; close.Enabled = false;
            cShortcut.Visible = cPlugin.Visible = cAuto.Visible = false;
            showFeatures = false; showProgress = true;
            SetStatus("Preparando la instalación…", 0.06f);
            try
            {
                await Task.Run(() => Extract());
                SetStatus(installedVersion != null ? "Actualizando…" : "Instalando…", 0.34f);
                WriteOptions();
                var code = await Task.Run(() => RunInner());
                if (code != 0) throw new Exception("el instalador terminó con el código " + code);
                SetStatus("Terminando…", 0.96f);
                await Task.Delay(500);
                if (!cShortcut.Checked && installedVersion == null) RemoveShortcut();
                done = true;
                SetStatus("¡Listo! " + AppName + " está instalado", 1f);
                title = "¡Todo listo!";
                sub = AppExe() != null ? "Pulsa el botón para abrir el HUB." : "Ábrelo desde el menú Inicio.";
                openApp.Visible = AppExe() != null;
                later.Text = "Cerrar"; later.Visible = true;
                foot = "Instalado en " + ProgramDir() + " · Xito Development · licencia MIT";
                Invalidate();
            }
            catch (Exception ex)
            {
                SetStatus("No se pudo instalar: " + ex.Message, 0f);
                title = "Ha fallado la instalación";
                sub = "Cierra el juego y el HUB (también en la bandeja) y vuelve a intentarlo.";
                go.Text = "Reintentar"; go.Visible = true; later.Visible = true;
                Invalidate();
            }
            finally
            {
                installing = false; close.Enabled = true;
                try { if (innerPath != null && File.Exists(innerPath)) File.Delete(innerPath); } catch { }
            }
        }

        void SetStatus(string text, float pct)
        {
            if (InvokeRequired) { BeginInvoke(new Action(() => SetStatus(text, pct))); return; }
            status = text; animTarget = pct; Invalidate(new Rectangle(0, barRect.Y - 34, ClientSize.Width, 50));
        }

        // El instalador real va pegado al final de este ejecutable
        void Extract()
        {
            var self = Assembly.GetExecutingAssembly().Location;
            using (var fs = new FileStream(self, FileMode.Open, FileAccess.Read))
            {
                var tail = new byte[16];
                fs.Seek(-16, SeekOrigin.End); fs.Read(tail, 0, 16);
                if (System.Text.Encoding.ASCII.GetString(tail, 8, 8) != Magic) throw new Exception("el instalador está incompleto (descárgalo de nuevo)");
                long len = BitConverter.ToInt64(tail, 0);
                innerPath = Path.Combine(Path.GetTempPath(), "XitoTruckHub-inner-" + Guid.NewGuid().ToString("N").Substring(0, 8) + ".exe");
                fs.Seek(-16 - len, SeekOrigin.End);
                using (var outFs = new FileStream(innerPath, FileMode.Create, FileAccess.Write))
                {
                    var buf = new byte[1 << 20];
                    long left = len;
                    while (left > 0)
                    {
                        int n = fs.Read(buf, 0, (int)Math.Min(buf.Length, left));
                        if (n <= 0) throw new Exception("archivo dañado");
                        outFs.Write(buf, 0, n);
                        left -= n;
                        SetStatus("Preparando la instalación…", 0.06f + 0.26f * (1f - (float)left / len));
                    }
                }
            }
        }

        void WriteOptions()
        {
            try
            {
                var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), AppName);
                Directory.CreateDirectory(dir);
                File.WriteAllText(Path.Combine(dir, "installer-options.json"),
                    "{\"autoStart\":" + (cAuto.Checked ? "true" : "false") + ",\"startMinimized\":false,\"installPlugin\":" + (cPlugin.Checked ? "true" : "false") + "}");
            }
            catch { }
        }

        int RunInner()
        {
            var psi = new ProcessStartInfo(innerPath, "/S") { UseShellExecute = false, CreateNoWindow = true };
            using (var p = Process.Start(psi))
            {
                var t = 0;
                while (!p.WaitForExit(200))
                {
                    t += 200;
                    SetStatus(installedVersion != null ? "Actualizando…" : "Instalando…", 0.34f + Math.Min(0.58f, t / 30000f * 0.58f));
                }
                return p.ExitCode;
            }
        }

        string AppExe()
        {
            foreach (var d in new[] { installDir, Path.Combine(ProgramFiles64(), AppName), Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), AppName), Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", AppName) })
            {
                if (string.IsNullOrEmpty(d)) continue;
                var exe = Path.Combine(d, AppName + ".exe");
                if (File.Exists(exe)) return exe;
            }
            return null;
        }
        // Se abre a través del explorador para que el HUB no herede los permisos de administrador
        void LaunchApp()
        {
            var exe = AppExe(); if (exe == null) return;
            try { Process.Start(new ProcessStartInfo("explorer.exe", "\"" + exe + "\"") { UseShellExecute = true }); }
            catch { try { Process.Start(new ProcessStartInfo(exe) { UseShellExecute = true }); } catch { } }
        }
        void RemoveShortcut()
        {
            foreach (var f in new[] { Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory), Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory) })
                try { var lnk = Path.Combine(f, AppName + ".lnk"); if (File.Exists(lnk)) File.Delete(lnk); } catch { }
        }

        [STAThread]
        static void Main(string[] args)
        {
            bool silent = false, auto = false;
            foreach (var a in args)
            {
                if (a.Equals("/S", StringComparison.OrdinalIgnoreCase) || a.Equals("/silent", StringComparison.OrdinalIgnoreCase)) silent = true;
                if (a.Equals("--auto", StringComparison.OrdinalIgnoreCase)) auto = true;
            }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupForm(silent, auto));
        }
    }
}
