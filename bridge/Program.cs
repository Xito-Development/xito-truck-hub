// Xito Truck Hub - Puente de telemetría ETS2/ATS
// Lee la memoria compartida del plugin scs-telemetry.dll (RenCloud, MIT) y la emite como JSON por stdout.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading;
using SCSSdkClient;
using SCSSdkClient.Object;

namespace XitoTelemetryBridge;

public static class Program
{
    static readonly object Lock = new();
    static SCSTelemetry last;
    static DateTime lastChange = DateTime.MinValue;
    static ulong lastStamp;
    static bool connected;
    static readonly JsonSerializerOptions Opts = new() { PropertyNamingPolicy = null };

    static void Emit(object o)
    {
        var json = JsonSerializer.Serialize(o, Opts);
        lock (Lock) { Console.Out.WriteLine(json); Console.Out.Flush(); }
    }

    static void Status(string state, string msg = "") => Emit(new { t = "status", state, msg });

    public static void Main()
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        Status("starting");
        new Thread(KeyLoop) { IsBackground = true }.Start();
        while (true)
        {
            SCSSdkTelemetry tel = null;
            try
            {
                tel = new SCSSdkTelemetry(200);
                if (tel.Error != null) { tel.Dispose(); Status("waiting", "Juego no detectado"); Thread.Sleep(3000); continue; }
                last = null; lastStamp = 0; lastChange = DateTime.Now;
                Hook(tel);
                while (true)
                {
                    Thread.Sleep(1000);
                    if ((DateTime.Now - lastChange).TotalSeconds > 20) break; // juego cerrado (margen para pantallas de carga largas)
                }
            }
            catch (Exception ex) { Status("error", ex.Message); }
            try { tel?.Dispose(); } catch { }
            if (connected) { connected = false; Status("waiting", "Juego cerrado"); }
            Thread.Sleep(3000);
        }
    }

    static void Hook(SCSSdkTelemetry tel)
    {
        tel.Data += (d, changed) =>
        {
            try
            {
                last = d;
                if (d.SdkActive && !connected) { connected = true; Status("connected"); }
                if (d.Timestamp != lastStamp || d.Paused) { lastStamp = d.Timestamp; lastChange = DateTime.Now; }
                Emit(Map(d));
            }
            catch (Exception ex) { Status("error", ex.Message); }
        };
        tel.JobStarted += (_, _) => { var d = last; if (d == null) return; Emit(new { t = "ev", type = "job_started", job = MapJob(d) }); };
        tel.JobDelivered += (_, _) =>
        {
            var d = last; if (d == null || !d.SpecialEventsValues.JobDelivered) return;
            var e = d.GamePlay.JobDelivered;
            Emit(new
            {
                t = "ev", type = "job_delivered", job = MapJob(d),
                revenue = e.Revenue, xp = e.EarnedXp, distanceKm = e.DistanceKm, cargoDamage = e.CargoDamage,
                autoParked = e.AutoParked, autoLoaded = e.AutoLoaded, deliveryMinutes = e.DeliveryTime?.Value ?? 0,
                startedGame = e.Started?.Value ?? 0, finishedGame = e.Finished?.Value ?? 0
            });
        };
        tel.JobCancelled += (_, _) =>
        {
            var d = last; if (d == null || !d.SpecialEventsValues.JobCancelled) return;
            Emit(new { t = "ev", type = "job_cancelled", job = MapJob(d), penalty = d.GamePlay.JobCancelled.Penalty });
        };
        tel.Fined += (_, _) =>
        {
            var d = last; if (d == null || !d.SpecialEventsValues.Fined) return;
            Emit(new { t = "ev", type = "fined", amount = d.GamePlay.FinedEvent.Amount, offence = d.GamePlay.FinedEvent.Offence.ToString() });
        };
        tel.Tollgate += (_, _) =>
        {
            var d = last; if (d == null || !d.SpecialEventsValues.Tollgate) return;
            Emit(new { t = "ev", type = "tollgate", amount = d.GamePlay.TollgateEvent.PayAmount });
        };
        tel.Ferry += (_, _) =>
        {
            var d = last; if (d == null || !d.SpecialEventsValues.Ferry) return;
            var f = d.GamePlay.FerryEvent;
            Emit(new { t = "ev", type = "ferry", amount = f.PayAmount, from = f.SourceName, to = f.TargetName });
        };
        tel.Train += (_, _) =>
        {
            var d = last; if (d == null || !d.SpecialEventsValues.Train) return;
            var f = d.GamePlay.TrainEvent;
            Emit(new { t = "ev", type = "train", amount = f.PayAmount, from = f.SourceName, to = f.TargetName });
        };
        tel.RefuelPayed += (_, _) =>
        {
            var d = last; if (d == null) return;
            Emit(new { t = "ev", type = "refuel", liters = d.GamePlay.RefuelEvent.Amount });
        };
    }

    // ---------- botonera: pulsa teclas en el juego (códigos de escaneo, que el juego sí reconoce) ----------
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)] struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public InputUnion U; }
    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
    const uint KEYUP = 0x2, SCANCODE = 0x8, EXTENDED = 0x1;

    static readonly Dictionary<string, (ushort sc, bool ext)> SC = new(StringComparer.OrdinalIgnoreCase) {
        ["ESCAPE"] = (0x01, false), ["1"] = (0x02, false), ["2"] = (0x03, false), ["3"] = (0x04, false), ["4"] = (0x05, false), ["5"] = (0x06, false),
        ["6"] = (0x07, false), ["7"] = (0x08, false), ["8"] = (0x09, false), ["9"] = (0x0A, false), ["0"] = (0x0B, false), ["-"] = (0x0C, false), ["="] = (0x0D, false),
        ["BACKSPACE"] = (0x0E, false), ["TAB"] = (0x0F, false), ["Q"] = (0x10, false), ["W"] = (0x11, false), ["E"] = (0x12, false), ["R"] = (0x13, false),
        ["T"] = (0x14, false), ["Y"] = (0x15, false), ["U"] = (0x16, false), ["I"] = (0x17, false), ["O"] = (0x18, false), ["P"] = (0x19, false),
        ["["] = (0x1A, false), ["]"] = (0x1B, false), ["ENTER"] = (0x1C, false), ["CTRL"] = (0x1D, false), ["A"] = (0x1E, false), ["S"] = (0x1F, false),
        ["D"] = (0x20, false), ["F"] = (0x21, false), ["G"] = (0x22, false), ["H"] = (0x23, false), ["J"] = (0x24, false), ["K"] = (0x25, false),
        ["L"] = (0x26, false), [";"] = (0x27, false), ["'"] = (0x28, false), ["`"] = (0x29, false), ["SHIFT"] = (0x2A, false), ["\\"] = (0x2B, false),
        ["Z"] = (0x2C, false), ["X"] = (0x2D, false), ["C"] = (0x2E, false), ["V"] = (0x2F, false), ["B"] = (0x30, false), ["N"] = (0x31, false),
        ["M"] = (0x32, false), [","] = (0x33, false), ["."] = (0x34, false), ["/"] = (0x35, false), ["ALT"] = (0x38, false), ["SPACE"] = (0x39, false),
        ["F1"] = (0x3B, false), ["F2"] = (0x3C, false), ["F3"] = (0x3D, false), ["F4"] = (0x3E, false), ["F5"] = (0x3F, false), ["F6"] = (0x40, false),
        ["F7"] = (0x41, false), ["F8"] = (0x42, false), ["F9"] = (0x43, false), ["F10"] = (0x44, false), ["F11"] = (0x57, false), ["F12"] = (0x58, false),
        ["NUM7"] = (0x47, false), ["NUM8"] = (0x48, false), ["NUM9"] = (0x49, false), ["NUM4"] = (0x4B, false), ["NUM5"] = (0x4C, false), ["NUM6"] = (0x4D, false),
        ["NUM1"] = (0x4F, false), ["NUM2"] = (0x50, false), ["NUM3"] = (0x51, false), ["NUM0"] = (0x52, false),
        ["UP"] = (0x48, true), ["DOWN"] = (0x50, true), ["LEFT"] = (0x4B, true), ["RIGHT"] = (0x4D, true), ["PAGEUP"] = (0x49, true), ["PAGEDOWN"] = (0x51, true),
        ["HOME"] = (0x47, true), ["END"] = (0x4F, true), ["INSERT"] = (0x52, true), ["DELETE"] = (0x53, true)
    };
    static void Key(string name, bool up) {
        if (!SC.TryGetValue(name, out var k)) { Status("keyerror", "Tecla desconocida: " + name); return; }
        var inp = new INPUT[1];
        inp[0].type = 1;
        inp[0].U.ki = new KEYBDINPUT { wScan = k.sc, dwFlags = SCANCODE | (up ? KEYUP : 0) | (k.ext ? EXTENDED : 0) };
        SendInput(1, inp, Marshal.SizeOf<INPUT>());
    }
    static void KeyLoop() {
        string line;
        while ((line = Console.In.ReadLine()) != null) {
            try {
                using var doc = JsonDocument.Parse(line);
                var r = doc.RootElement;
                var keys = r.GetProperty("k").GetString().Split('+');
                var a = r.TryGetProperty("a", out var av) ? av.GetString() : "tap";
                if (a == "down") { foreach (var k in keys) Key(k.Trim(), false); }
                else if (a == "up") { for (int i = keys.Length - 1; i >= 0; i--) Key(keys[i].Trim(), true); }
                else {
                    foreach (var k in keys) Key(k.Trim(), false);
                    Thread.Sleep(r.TryGetProperty("ms", out var ms) ? ms.GetInt32() : 70);
                    for (int i = keys.Length - 1; i >= 0; i--) Key(keys[i].Trim(), true);
                }
            } catch (Exception ex) { Status("keyerror", ex.Message); }
        }
    }

    static object MapJob(SCSTelemetry d)
    {
        var j = d.JobValues;
        return new
        {
            onJob = d.SpecialEventsValues.OnJob,
            cargo = j.CargoValues?.Name, cargoId = j.CargoValues?.Id, mass = j.CargoValues?.Mass ?? 0,
            cargoDamage = j.CargoValues?.CargoDamage ?? 0, units = j.CargoValues?.UnitCount ?? 0,
            fromCity = j.CitySource, fromCompany = j.CompanySource, toCity = j.CityDestination, toCompany = j.CompanyDestination,
            fromCityId = j.CitySourceId, toCityId = j.CityDestinationId,
            income = j.Income, special = j.SpecialJob, market = j.Market.ToString(), loaded = j.CargoLoaded,
            deadline = j.DeliveryTime?.Value ?? 0, remainingMin = j.RemainingDeliveryTime?.Value ?? 0
        };
    }

    static object Map(SCSTelemetry d)
    {
        var tc = d.TruckValues.ConstantsValues;
        var cur = d.TruckValues.CurrentValues;
        var dash = cur.DashboardValues;
        var tr = d.TrailerValues != null && d.TrailerValues.Length > 0 ? d.TrailerValues[0] : null;
        var pos = cur.PositionValue?.Position;
        return new
        {
            t = "tel",
            game = d.Game.ToString(),
            sdk = d.SdkActive, paused = d.Paused,
            gameTime = d.CommonValues.GameTime?.Value ?? 0,
            restStop = d.CommonValues.NextRestStop?.Value ?? 0,
            mpOffset = d.MultiplayerTimeOffset,
            truck = new
            {
                brand = tc.Brand, name = tc.Name, plate = tc.LicensePlate, plateCountry = tc.LicensePlateCountry,
                speed = dash.Speed?.Kph ?? 0, cruise = dash.CruiseControl, cruiseSpeed = dash.CruiseControlSpeed?.Kph ?? 0,
                rpm = dash.RPM, rpmMax = tc.MotorValues.EngineRpmMax, gear = dash.GearDashboards, gearSel = cur.MotorValues.GearValues.Selected, shifter = tc.MotorValues.ShifterTypeValue.ToString(), revGears = tc.MotorValues.ReverseGearCount,
                fwdGears = tc.MotorValues.ForwardGearCount,
                fuel = dash.FuelValue.Amount, fuelCap = tc.CapacityValues.Fuel, fuelAvg = dash.FuelValue.AverageConsumption,
                fuelRange = dash.FuelValue.Range, adblue = dash.AdBlue, adblueCap = tc.CapacityValues.AdBlue,
                odometer = dash.Odometer, oilTemp = dash.OilTemperature, waterTemp = dash.WaterTemperature,
                oilPressure = dash.OilPressure, battery = dash.BatteryVoltage,
                air = cur.MotorValues.BrakeValues.AirPressure, parking = cur.MotorValues.BrakeValues.ParkingBrake,
                engineBrake = cur.MotorValues.BrakeValues.MotorBrake, retarder = cur.MotorValues.BrakeValues.RetarderLevel,
                engineOn = cur.EngineEnabled, electricOn = cur.ElectricEnabled,
                lights = new
                {
                    low = cur.LightsValues.BeamLow, high = cur.LightsValues.BeamHigh, beacon = cur.LightsValues.Beacon,
                    left = cur.LightsValues.BlinkerLeftActive, right = cur.LightsValues.BlinkerRightActive, leftOn = cur.LightsValues.BlinkerLeftOn, rightOn = cur.LightsValues.BlinkerRightOn,
                    hazard = cur.LightsValues.HazardWarningLights, parking = cur.LightsValues.Parking
                },
                warn = new
                {
                    fuel = dash.WarningValues.FuelW, air = dash.WarningValues.AirPressure, adblue = dash.WarningValues.AdBlue,
                    oil = dash.WarningValues.OilPressure, water = dash.WarningValues.WaterTemperature, battery = dash.WarningValues.BatteryVoltage
                },
                damage = new
                {
                    engine = cur.DamageValues.Engine, transmission = cur.DamageValues.Transmission, cabin = cur.DamageValues.Cabin,
                    chassis = cur.DamageValues.Chassis, wheels = cur.DamageValues.WheelsAvg
                },
                x = pos?.X ?? 0, z = pos?.Z ?? 0, heading = cur.PositionValue?.Orientation?.Heading ?? 0
            },
            trailer = tr == null ? null : new
            {
                attached = tr.Attached, name = tr.Name, brand = tr.Brand, plate = tr.LicensePlate,
                damage = new { body = tr.DamageValues.Body, cargo = tr.DamageValues.Cargo, chassis = tr.DamageValues.Chassis, wheels = tr.DamageValues.Wheels }
            },
            nav = new
            {
                distance = d.NavigationValues.NavigationDistance, time = d.NavigationValues.NavigationTime,
                limit = d.NavigationValues.SpeedLimit?.Kph ?? 0
            },
            input = new { throttle = d.ControlValues.GameValues.Throttle, brake = d.ControlValues.GameValues.Brake, clutch = d.ControlValues.GameValues.Clutch },
            job = MapJob(d)
        };
    }
}
