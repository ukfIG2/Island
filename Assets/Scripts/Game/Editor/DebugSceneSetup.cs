using UnityEditor;
using UnityEngine;

namespace ResortEmpire.Game.EditorTools
{
    public static class DebugSceneSetup
    {
        [MenuItem("Resort Empire/Add Debug Runner To Scene")]
        static void AddDebugRunner()
        {
            var existing = GameObject.Find("DebugWaveRunner");
            if (existing != null && existing.GetComponent<DebugWaveRunner>() != null)
            {
                Selection.activeGameObject = existing;
                return;
            }
            var go = new GameObject("DebugWaveRunner");
            go.AddComponent<DebugWaveRunner>();
            Undo.RegisterCreatedObjectUndo(go, "Add Debug Runner");
            Selection.activeGameObject = go;
        }
    }
}
