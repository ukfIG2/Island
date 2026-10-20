using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace ResortEmpire.Game.EditorTools
{
    // Builds the one real game scene from scratch. Safe to run repeatedly: it recreates and
    // overwrites GameScene.unity and rewrites the build list every time.
    public static class GameSceneCreator
    {
        const string ScenePath = "Assets/Scenes/GameScene.unity";
        const string SampleScenePath = "Assets/Scenes/SampleScene.unity";

        [MenuItem("Resort Empire/Create Game Scene")]
        static void CreateGameScene()
        {
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            var cam = camGo.AddComponent<Camera>();
            camGo.AddComponent<AudioListener>();
            // Framed so the Reception roof clears the top bar and the docked boat stays above the bottom edge.
            camGo.transform.position = new Vector3(-0.6f, 15.5f, -12.5f);
            camGo.transform.rotation = Quaternion.Euler(44f, 0f, 0f);
            cam.orthographic = false;
            cam.fieldOfView = 38f;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.47f, 0.76f, 0.95f); // solid sky blue

            var lightGo = new GameObject("Directional Light");
            lightGo.transform.rotation = Quaternion.Euler(50f, -30f, 0f);
            var light = lightGo.AddComponent<Light>();
            light.type = LightType.Directional;
            light.color = new Color(1f, 0.95f, 0.84f); // warm late-morning sun
            light.intensity = 1.1f;
            light.shadows = LightShadows.Soft;

            var root = new GameObject("GameRoot");
            root.AddComponent<GameBootstrap>();

            if (!AssetDatabase.IsValidFolder("Assets/Scenes"))
                AssetDatabase.CreateFolder("Assets", "Scenes");
            EditorSceneManager.SaveScene(scene, ScenePath);

            var buildScenes = new List<EditorBuildSettingsScene>
            {
                new EditorBuildSettingsScene(ScenePath, true)
            };
            if (File.Exists(SampleScenePath))
                buildScenes.Add(new EditorBuildSettingsScene(SampleScenePath, true));
            EditorBuildSettings.scenes = buildScenes.ToArray();

            Debug.Log("GameScene created at " + ScenePath + " and set first in Build Settings.");
        }
    }
}
