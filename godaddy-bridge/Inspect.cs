using System;
using System.Reflection;
using PoyntPOSBridge;

namespace godaddy_bridge
{
    class Program
    {
        static void Main(string[] args)
        {
            try
            {
                var assembly = typeof(PoyntPOSApi).Assembly;
                Console.WriteLine("Assembly: " + assembly.FullName);
                foreach (var type in assembly.GetTypes())
                {
                    if (!type.IsPublic) continue;
                    Console.WriteLine($"\nType: {type.FullName}");
                    foreach (var method in type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static))
                    {
                        if (method.DeclaringType != type) continue;
                        Console.Write($"  Method: {method.ReturnType.Name} {method.Name}(");
                        var parameters = method.GetParameters();
                        for (int i = 0; i < parameters.Length; i++)
                        {
                            Console.Write($"{parameters[i].ParameterType.Name} {parameters[i].Name}");
                            if (i < parameters.Length - 1) Console.Write(", ");
                        }
                        Console.WriteLine(")");
                    }
                    foreach (var prop in type.GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static))
                    {
                        Console.WriteLine($"  Property: {prop.PropertyType.Name} {prop.Name}");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error: " + ex.Message);
            }
        }
    }
}
