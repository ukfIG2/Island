using System;
using System.IO;

namespace ResortEmpire.Game
{
    // Crash-safe text files for saves. A phone can kill the app in the middle of a write, and a half-written file must
    // never replace a good one: the text goes to a temporary file first and is swapped in, and the previous good file
    // stays next to it as a backup. Plain C# on purpose, so it can be tested without a running game.
    public static class SafeFile
    {
        public static string BackupPath(string path) => path + ".bak";
        static string TempPath(string path) => path + ".tmp";

        public static void Write(string path, string text)
        {
            string temp = TempPath(path);
            File.WriteAllText(temp, text);
            if (!File.Exists(path))
            {
                File.Move(temp, path);
                return;
            }
            try
            {
                File.Replace(temp, path, BackupPath(path)); // one swap; the old file becomes the backup
            }
            catch (Exception)
            {
                // A platform without File.Replace: copy the old file aside first, then the new one over it.
                File.Copy(path, BackupPath(path), true);
                File.Copy(temp, path, true);
                File.Delete(temp);
            }
        }

        // The text of the main file if it passes the check, otherwise the backup's, otherwise null.
        public static string ReadBest(string path, Func<string, bool> isValid)
        {
            foreach (string candidate in new[] { path, BackupPath(path) })
            {
                try
                {
                    if (!File.Exists(candidate)) continue;
                    string text = File.ReadAllText(candidate);
                    if (isValid(text)) return text;
                }
                catch (Exception)
                {
                    // unreadable: try the next candidate
                }
            }
            return null;
        }

        // Removes the file, its backup and any leftover temporary file; true if the main file existed.
        public static bool Delete(string path)
        {
            bool existed = File.Exists(path);
            foreach (string file in new[] { path, BackupPath(path), TempPath(path) })
                if (File.Exists(file)) File.Delete(file);
            return existed;
        }
    }
}
