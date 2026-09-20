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
        readonly bool silent;
        string innerPath, installedVersion, installDir;
        readonly Label title = new Label(), sub = new Label(), status = new Label(), pctLbl = new Label(), foot = new Label();
        readonly XButton go = new XButton(), later = new XButton { Primary = false }, openApp = new XButton();
        readonly XProgress bar = new XProgress();
        readonly XCheck cShortcut = new XCheck { Text = "Crear acceso directo en el escritorio", Checked = true };
        readonly XCheck cAuto = new XCheck { Text = "Iniciar con Windows", Sub = "Así registra todos tus viajes aunque olvides abrirlo", Checked = false };
        readonly XCheck cPlugin = new XCheck { Text = "Instalar el plugin de telemetría en ETS2 y ATS", Sub = "Necesario para leer tu camión", Checked = true };
        Panel body = new Panel();
        Panel featsPanel;
        System.Windows.Forms.Timer anim = new System.Windows.Forms.Timer { Interval = 40 };
        float animTarget, animVal;

        public SetupForm(bool silent)
        {
            this.silent = silent;
            Text = "Instalar Xito Truck Hub";
            FormBorderStyle = FormBorderStyle.None; StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(620, 460); BackColor = Theme.Bg; DoubleBuffered = true;
            Icon = LoadIcon();
            Region = new Region(XButton.Round(new Rectangle(0, 0, ClientSize.Width, ClientSize.Height), 16));
            BuildUi();
            Detect();
            anim.Tick += (s, e) => { animVal += (animTarget - animVal) * 0.18f; bar.Value = animVal; pctLbl.Text = (int)(animVal * 100) + " %"; };
            anim.Start();
            if (silent) { Opacity = 0; Shown += async (s, e) => { await Run(); Close(); }; }
        }

        Icon LoadIcon()
        {
            try { return Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location); } catch { return null; }
        }

        void BuildUi()
        {
            // cabecera
            var close = new XButton { Primary = false, Text = "", Width = 34, Height = 28, Left = ClientSize.Width - 46, Top = 12 };
            close.Paint += (s, e) =>
            {
                var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
                using (var p = new Pen(Theme.Text, 1.8f) { StartCap = LineCap.Round, EndCap = LineCap.Round })
                { g.DrawLine(p, 12, 10, 22, 18); g.DrawLine(p, 22, 10, 12, 18); }
            };
            close.Click += (s, e) => { if (!installing) Close(); };
            Controls.Add(close);

            var logo = new Panel { Left = 34, Top = 34, Width = 56, Height = 56, BackColor = Theme.Accent };
            logo.Region = new Region(XButton.Round(new Rectangle(0, 0, 56, 56), 16));
            logo.Paint += (s, e) =>
            {
                var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
                using (var p = new Pen(Theme.AccentInk, 2.6f) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round })
                {
                    g.DrawRectangle(p, 10, 18, 22, 18);
                    g.DrawLines(p, new[] { new Point(32, 24), new Point(40, 24), new Point(46, 30), new Point(46, 36), new Point(32, 36) });
                    g.DrawEllipse(p, 14, 34, 7, 7); g.DrawEllipse(p, 34, 34, 7, 7);
                }
            };
            Controls.Add(logo);

            title.SetBounds(106, 38, 460, 32); title.Font = Theme.F(17f, FontStyle.Bold); title.ForeColor = Theme.Text; title.BackColor = Color.Transparent;
            sub.SetBounds(106, 70, 470, 22); sub.Font = Theme.F(9.5f); sub.ForeColor = Theme.Muted; sub.BackColor = Color.Transparent;
            Controls.Add(title); Controls.Add(sub);

            body.SetBounds(34, 112, ClientSize.Width - 68, 250); body.BackColor = Color.Transparent;
            Controls.Add(body);

            cShortcut.SetBounds(0, 6, body.Width, 32);
            cPlugin.SetBounds(0, 44, body.Width, 44);
            cAuto.SetBounds(0, 94, body.Width, 44);
            body.Controls.Add(cShortcut); body.Controls.Add(cPlugin); body.Controls.Add(cAuto);

            // Tres cosas que hace el programa, para llenar la tarjeta
            var feats = new Panel { Left = 0, Top = 150, Width = body.Width, Height = 96, BackColor = Color.Transparent };
            feats.Paint += (s2, e2) =>
            {
                var g = e2.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
                string[,] items = { { "Cabina y telemetría en directo", "Velocidad, trabajo, daños y mandos" }, { "Historial, estadísticas y mapa", "Entregas, rutas, tráfico y convoyes" }, { "Overlay en el juego y app para el móvil", "Dentro de ETS2 y desde cualquier lugar" } };
                for (int i = 0; i < 3; i++)
                {
                    int y = i * 32;
                    using (var b = new SolidBrush(Theme.Accent)) g.FillEllipse(b, 4, y + 10, 7, 7);
                    TextRenderer.DrawText(g, items[i, 0], Theme.F(9.5f, FontStyle.Bold), new Rectangle(22, y + 2, feats.Width - 22, 18), Theme.Text, TextFormatFlags.Left);
                    TextRenderer.DrawText(g, items[i, 1], Theme.F(8.5f), new Rectangle(22, y + 18, feats.Width - 22, 16), Theme.Muted, TextFormatFlags.Left);
                }
            };
            body.Controls.Add(feats);
            featsPanel = feats;

            status.SetBounds(0, 150, body.Width - 70, 24); status.Font = Theme.F(10f, FontStyle.Bold); status.ForeColor = Theme.Text; status.BackColor = Color.Transparent; status.Visible = false;
            pctLbl.SetBounds(body.Width - 70, 150, 70, 24); pctLbl.Font = Theme.F(10f, FontStyle.Bold); pctLbl.ForeColor = Theme.Accent; pctLbl.TextAlign = ContentAlignment.MiddleRight; pctLbl.BackColor = Color.Transparent; pctLbl.Visible = false;
            bar.SetBounds(0, 178, body.Width, 10); bar.Visible = false;
            body.Controls.Add(status); body.Controls.Add(pctLbl); body.Controls.Add(bar);

            go.SetBounds(ClientSize.Width - 34 - 200, ClientSize.Height - 82, 200, 46); go.Text = "Instalar";
            later.SetBounds(34, ClientSize.Height - 82, 130, 46); later.Text = "Cancelar";
            openApp.SetBounds(ClientSize.Width - 34 - 230, ClientSize.Height - 82, 230, 46); openApp.Text = "Abrir Xito Truck Hub"; openApp.Visible = false;
            go.Click += async (s, e) => await Run();
            later.Click += (s, e) => { if (!installing) Close(); };
            openApp.Click += (s, e) => { LaunchApp(); Close(); };
            Controls.Add(go); Controls.Add(later); Controls.Add(openApp);

            foot.SetBounds(34, ClientSize.Height - 30, 400, 20); foot.Font = Theme.F(8f); foot.ForeColor = Color.FromArgb(120, Theme.Muted); foot.BackColor = Color.Transparent;
            foot.Text = "Xito Development · licencia MIT";
            Controls.Add(foot);

            MouseDown += Drag; title.MouseDown += Drag; sub.MouseDown += Drag; logo.MouseDown += Drag;
        }

        void Drag(object s, MouseEventArgs e)
        {
            if (e.Button != MouseButtons.Left) return;
            ReleaseCapture(); SendMessage(Handle, 0xA1, 0x2, 0);
        }
        [DllImport("user32.dll")] static extern int SendMessage(IntPtr h, int m, int w, int l);
        [DllImport("user32.dll")] static extern bool ReleaseCapture();

        protected override void OnPaintBackground(PaintEventArgs e) { PaintBg(e.Graphics); }
        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            using (var p = new Pen(Theme.Line)) e.Graphics.DrawPath(p, XButton.Round(new Rectangle(0, 0, ClientSize.Width - 1, ClientSize.Height - 1), 16));
        }
        // Fondo con degradado y una carretera sutil, como en la app
        public void PaintBg(Graphics g)
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using (var b = new LinearGradientBrush(new Rectangle(0, 0, ClientSize.Width, ClientSize.Height), Theme.Bg2, Theme.Bg, 60f)) g.FillRectangle(b, 0, 0, ClientSize.Width, ClientSize.Height);
            using (var b = new SolidBrush(Color.FromArgb(14, Theme.Accent)))
                g.FillPolygon(b, new[] { new Point(ClientSize.Width - 130, ClientSize.Height), new Point(ClientSize.Width - 40, 120), new Point(ClientSize.Width - 10, 120), new Point(ClientSize.Width + 90, ClientSize.Height) });
            using (var p = new Pen(Color.FromArgb(55, Theme.Accent), 3f) { DashStyle = DashStyle.Custom, DashPattern = new[] { 2f, 3f } })
                g.DrawLine(p, ClientSize.Width - 44, 140, ClientSize.Width - 70, ClientSize.Height);
        }

        void Detect()
        {
            installedVersion = null;
            foreach (var root in new[] { Registry.LocalMachine, Registry.CurrentUser })
                using (var k = root.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall"))
                    if (k != null)
                        foreach (var name in k.GetSubKeyNames())
                            using (var sk = k.OpenSubKey(name))
                            {
                                var dn = sk?.GetValue("DisplayName") as string;
                                if (dn != null && dn.StartsWith("Xito Truck Hub", StringComparison.OrdinalIgnoreCase))
                                {
                                    installedVersion = sk.GetValue("DisplayVersion") as string;
                                    installDir = sk.GetValue("InstallLocation") as string;
                                }
                            }
            var ver = Assembly.GetExecutingAssembly().GetName().Version;
            var vs = ver == null ? "" : ver.Major + "." + ver.Minor + "." + ver.Build;
            if (installedVersion != null)
            {
                title.Text = "Actualizar Xito Truck Hub";
                sub.Text = "Tienes la " + installedVersion + " · se instalará la " + vs + " conservando todos tus datos";
                foot.Text = "Se instalará en " + (string.IsNullOrEmpty(installDir) ? @"C:\Program Files\Xito Truck Hub" : installDir) + " · Xito Development";
                go.Text = "Actualizar";
                cShortcut.Visible = false; cPlugin.Top = 6; cAuto.Top = 56;
            }
            else
            {
                title.Text = "Instalar Xito Truck Hub " + vs;
                sub.Text = "Tu centro de mando para Euro Truck Simulator 2 y TruckersMP";
                foot.Text = @"Se instalará en C:\Program Files\Xito Truck Hub · Xito Development · licencia MIT";
            }
        }

        bool installing;
        async Task Run()
        {
            if (installing) return;
            installing = true;
            go.Visible = false; later.Visible = false;
            cShortcut.Visible = cPlugin.Visible = cAuto.Visible = false;
            if (featsPanel != null) featsPanel.Visible = false;
            status.Visible = pctLbl.Visible = bar.Visible = true;
            SetStatus("Preparando la instalación…", 0.08f);
            try
            {
                await Task.Run(() => Extract());
                SetStatus(installedVersion != null ? "Actualizando…" : "Instalando…", 0.35f);
                WriteOptions();
                var code = await Task.Run(() => RunInner());
                if (code != 0) throw new Exception("El instalador terminó con el código " + code);
                SetStatus("Terminando…", 0.95f);
                await Task.Delay(600);
                if (!cShortcut.Visible && cShortcut.Checked == false) RemoveShortcut();
                SetStatus("¡Listo! Xito Truck Hub está instalado", 1f);
                title.Text = "¡Todo listo!";
                sub.Text = "Abre el HUB y el asistente te guiará con el juego, TruckersMP y el móvil.";
                openApp.Visible = true;
                if (silent) LaunchApp();
            }
            catch (Exception ex)
            {
                SetStatus("No se pudo instalar: " + ex.Message, 0f);
                title.Text = "Ha fallado la instalación";
                sub.Text = "Prueba a cerrar el juego y el HUB y vuelve a intentarlo.";
                go.Text = "Reintentar"; go.Visible = true; later.Visible = true; installing = false;
            }
            finally { try { if (innerPath != null && File.Exists(innerPath)) File.Delete(innerPath); } catch { } }
        }

        void SetStatus(string text, float pct)
        {
            if (InvokeRequired) { BeginInvoke(new Action(() => SetStatus(text, pct))); return; }
            status.Text = text; animTarget = pct;
        }

        // El instalador real va pegado al final de este ejecutable
        void Extract()
        {
            var self = Assembly.GetExecutingAssembly().Location;
            using (var fs = new FileStream(self, FileMode.Open, FileAccess.Read))
            {
                var tail = new byte[16];
                fs.Seek(-16, SeekOrigin.End); fs.Read(tail, 0, 16);
                var magic = System.Text.Encoding.ASCII.GetString(tail, 8, 8);
                if (magic != Magic) throw new Exception("El instalador está incompleto (descárgalo de nuevo)");
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
                        if (n <= 0) throw new Exception("Archivo dañado");
                        outFs.Write(buf, 0, n);
                        left -= n;
                        SetStatus("Preparando la instalación…", 0.08f + 0.22f * (1f - (float)left / len));
                    }
                }
            }
        }

        // Opciones que la app aplica al abrirse por primera vez
        void WriteOptions()
        {
            try
            {
                var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Xito Truck Hub");
                Directory.CreateDirectory(dir);
                File.WriteAllText(Path.Combine(dir, "installer-options.json"),
                    "{\"autoStart\":" + (cAuto.Checked ? "true" : "false") + ",\"startMinimized\":false,\"installPlugin\":" + (cPlugin.Checked ? "true" : "false") + "}");
            }
            catch { }
        }

        int RunInner()
        {
            var psi = new ProcessStartInfo(innerPath, "/S --force-run") { UseShellExecute = false, CreateNoWindow = true };
            using (var p = Process.Start(psi))
            {
                var t = 0;
                while (!p.WaitForExit(200))
                {
                    t += 200;
                    // Progreso estimado mientras el instalador trabaja (suele tardar 10-30 s)
                    SetStatus(installedVersion != null ? "Actualizando…" : "Instalando…", 0.35f + Math.Min(0.55f, t / 30000f * 0.55f));
                }
                return p.ExitCode;
            }
        }

        string AppExe()
        {
            var dirs = new[] { installDir, Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Xito Truck Hub") };
            foreach (var d in dirs)
            {
                if (string.IsNullOrEmpty(d)) continue;
                var exe = Path.Combine(d, "Xito Truck Hub.exe");
                if (File.Exists(exe)) return exe;
            }
            return null;
        }
        void LaunchApp()
        {
            var exe = AppExe(); if (exe == null) return;
            // Se abre a través del explorador para que no herede los permisos de administrador
            try { Process.Start(new ProcessStartInfo("explorer.exe", "\"" + exe + "\"") { UseShellExecute = true }); } catch { }
        }
        void RemoveShortcut()
        {
            foreach (var f in new[] { Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory), Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory) })
            {
                try { var lnk = Path.Combine(f, "Xito Truck Hub.lnk"); if (File.Exists(lnk)) File.Delete(lnk); } catch { }
            }
        }

        [STAThread]
        static void Main(string[] args)
        {
            bool silent = false;
            foreach (var a in args) if (a.Equals("/S", StringComparison.OrdinalIgnoreCase) || a.Equals("/silent", StringComparison.OrdinalIgnoreCase)) silent = true;
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupForm(silent));
        }
    }
}
