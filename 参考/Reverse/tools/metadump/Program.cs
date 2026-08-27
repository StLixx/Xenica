using dnlib.DotNet;
using dnlib.DotNet.Emit;

if (args.Length < 2) { Console.Error.WriteLine("usage: ildump <dll> <TypeName[:MethodName]>"); return 1; }
var path = args[0];
var target = args[1];
var colonIdx = target.IndexOf(':');
var typeFilter = colonIdx < 0 ? target : target.Substring(0, colonIdx);
var methodFilter = colonIdx < 0 ? null : target.Substring(colonIdx + 1);

var mod = ModuleDefMD.Load(path);

static bool Match(string s, string? filter) =>
    filter is null || (filter.Length > 0 && s.IndexOf(filter, StringComparison.OrdinalIgnoreCase) >= 0);

int printedTypes = 0;
foreach (var t in mod.GetTypes())
{
    var fullName = t.FullName;
    if (!Match(fullName, typeFilter)) continue;
    printedTypes++;
    Console.WriteLine($"// ==== {fullName} ====");
    Console.WriteLine($"[{(t.IsPublic ? "public" : "internal")}{(t.IsAbstract ? " abstract" : "")}{(t.IsSealed ? " sealed" : "")}{(t.IsInterface ? " interface" : " class")}] {fullName}");
    if (t.BaseType != null && t.BaseType.FullName != "System.Object" && t.BaseType.FullName != "System.ValueType")
        Console.WriteLine($"  : {t.BaseType.FullName}");
    foreach (var i in t.Interfaces)
        Console.WriteLine($"  // implements {i.Interface.FullName}");

    // fields
    foreach (var f in t.Fields)
    {
        if (f.IsSpecialName) continue;
        Console.WriteLine($"  {(f.IsPublic ? "public" : f.IsPrivate ? "private" : "internal")} {f.FieldType.FullName} {f.Name};");
    }

    // methods
    foreach (var m in t.Methods)
    {
        if (methodFilter != null && !Match(m.Name, methodFilter)) continue;
        if (m.IsSpecialName && !m.Name.StartsWith("op_") && !m.Name.StartsWith(".ctor") && !m.Name.StartsWith(".cctor")) continue;
        PrintMethod(m);
    }
    Console.WriteLine();
}
if (printedTypes == 0) Console.Error.WriteLine($"(no type matched '{typeFilter}')");
return 0;

static void PrintMethod(MethodDef m)
{
    var parms = string.Join(", ", m.Parameters.Select(p => $"{p.Type.FullName} {p.Name}"));
    var ret = m.ReturnType.FullName;
    var mods = "";
    if (m.IsPublic) mods += "public ";
    else if (m.IsPrivate) mods += "private ";
    else mods += "internal ";
    if (m.IsStatic) mods += "static ";
    if (m.IsAbstract) mods += "abstract ";
    if (m.IsVirtual && !m.IsNewSlot) mods += "override ";
    if (m.IsConstructor) mods = m.IsStatic ? "static " : "public ";

    if (m.IsConstructor) Console.WriteLine($"  {mods}{m.DeclaringType.Name}({parms})");
    else Console.WriteLine($"  {mods}{ret} {m.Name}({parms})");
    Console.WriteLine("  {");

    if (m.HasBody)
    {
        int indent = 4;
        foreach (var instr in m.Body.Instructions)
        {
            var op = instr.OpCode;
            string operand = instr.Operand switch
            {
                null => "",
                string s => "\"" + s.Replace("\"", "\\\"") + "\"",
                Instruction ti => LabelOf(ti),
                IMethodDefOrRef mr => mr.FullName,
                IField f => f.FullName,
                ITypeDefOrRef tr => tr.FullName,
                Instruction[] arr => "[" + string.Join(", ", arr.Select(LabelOf)) + "]",
                _ => instr.Operand.ToString() ?? ""
            };
            Console.WriteLine($"{new string(' ', indent)}{op.Code,-12} {operand}");
        }
    }
    Console.WriteLine("  }");
}

static string LabelOf(Instruction i)
{
    // IL_<offset>
    return $"IL_{i.Offset:X4}";
}
