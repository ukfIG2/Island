using System;
using System.IO;
using NUnit.Framework;

namespace ResortEmpire.Game.Tests
{
    public class SafeFileTests
    {
        const string Good = "{\"coins\":100}";
        const string Newer = "{\"coins\":250}";

        static bool LooksComplete(string text) => text.StartsWith("{") && text.EndsWith("}");

        // Each test works in its own temporary folder, never in the player's real save folder.
        static void InTempFolder(Action<string> body)
        {
            string dir = Path.Combine(Path.GetTempPath(), "island-safefile-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(dir);
            try { body(Path.Combine(dir, "save.json")); }
            finally { Directory.Delete(dir, true); }
        }

        [Test]
        public void Write_CreatesTheFileAndLeavesNoTemporaryFile()
        {
            InTempFolder(path =>
            {
                SafeFile.Write(path, Good);
                Assert.AreEqual(Good, File.ReadAllText(path));
                Assert.IsFalse(File.Exists(path + ".tmp"));
            });
        }

        [Test]
        public void Write_KeepsThePreviousSaveAsBackup()
        {
            InTempFolder(path =>
            {
                SafeFile.Write(path, Good);
                SafeFile.Write(path, Newer);
                Assert.AreEqual(Newer, File.ReadAllText(path));
                Assert.AreEqual(Good, File.ReadAllText(SafeFile.BackupPath(path)));
                Assert.IsFalse(File.Exists(path + ".tmp"));
            });
        }

        [Test]
        public void ReadBest_FallsBackToTheBackupWhenTheMainFileIsCutShort()
        {
            InTempFolder(path =>
            {
                SafeFile.Write(path, Good);
                SafeFile.Write(path, Newer);
                File.WriteAllText(path, Newer.Substring(0, Newer.Length / 2)); // the app was killed mid-write
                Assert.AreEqual(Good, SafeFile.ReadBest(path, LooksComplete));
            });
        }

        [Test]
        public void ReadBest_ReturnsTheMainFileWhenItIsComplete()
        {
            InTempFolder(path =>
            {
                SafeFile.Write(path, Good);
                SafeFile.Write(path, Newer);
                Assert.AreEqual(Newer, SafeFile.ReadBest(path, LooksComplete));
            });
        }

        [Test]
        public void ReadBest_ReturnsNullWhenNeitherFileIsValid()
        {
            InTempFolder(path =>
            {
                Assert.IsNull(SafeFile.ReadBest(path, LooksComplete));  // nothing saved yet
                File.WriteAllText(path, "{\"coi");
                File.WriteAllText(SafeFile.BackupPath(path), "garbage");
                Assert.IsNull(SafeFile.ReadBest(path, LooksComplete));
            });
        }

        [Test]
        public void Delete_RemovesTheBackupToo_SoAResetCannotBringTheOldGameBack()
        {
            InTempFolder(path =>
            {
                SafeFile.Write(path, Good);
                SafeFile.Write(path, Newer);
                Assert.IsTrue(SafeFile.Delete(path));
                Assert.IsFalse(File.Exists(path));
                Assert.IsFalse(File.Exists(SafeFile.BackupPath(path)));
                Assert.IsNull(SafeFile.ReadBest(path, LooksComplete));
                Assert.IsFalse(SafeFile.Delete(path));
            });
        }
    }
}
