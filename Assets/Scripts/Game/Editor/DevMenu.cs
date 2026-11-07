using UnityEditor;
using UnityEngine;

namespace ResortEmpire.Game.EditorTools
{
    public static class DevMenu
    {
        [MenuItem("Resort Empire/Reset Save (start a new game)")]
        static void ResetSave()
        {
            if (EditorApplication.isPlaying)
            {
                Debug.LogWarning("Stop play mode before resetting the save.");
                return;
            }
            Debug.Log(SaveSystem.Delete()
                ? "Resort save deleted — the next Play starts a new game."
                : "No resort save found at " + SaveSystem.SavePath);
        }
    }
}
