using System.Collections.Generic;
using UnityEngine;

namespace ResortEmpire.Game.Sound
{
    // CAM-117: plays the game's sounds. It owns a few audio sources, asks SoundRules whether a cue may sound, and
    // follows the player's Sound and Music switches at once. It never decides what happens in the game: whatever
    // wants a sound asks for a cue through Sfx.
    public sealed class SoundDirector : MonoBehaviour, ISoundSink
    {
        const int VoiceCount = 8;

        AppSettings _settings;
        SoundRules _rules;
        SoundBank _bank;
        AudioSource[] _voices;
        int _next;
        bool _soundWasOn;
        readonly Queue<SoundCue> _recent = new Queue<SoundCue>();

        // The last few cues that sounded, newest last. Only for checking the sound in Play mode.
        public IReadOnlyCollection<SoundCue> Recent => _recent;

        public static SoundDirector Create(Transform parent, AppSettings settings)
        {
            var go = new GameObject("Sound");
            go.transform.SetParent(parent, false);
            var director = go.AddComponent<SoundDirector>();
            director.Init(settings);
            return director;
        }

        void Init(AppSettings settings)
        {
            _settings = settings;
            _rules = new SoundRules(settings);
            _bank = new SoundBank();
            _voices = new AudioSource[VoiceCount];
            for (int i = 0; i < VoiceCount; i++) _voices[i] = NewSource("Voice" + i, false);
            _soundWasOn = settings.SoundOn;
            Sfx.Sink = this;
        }

        AudioSource NewSource(string name, bool loop)
        {
            var source = new GameObject(name).AddComponent<AudioSource>();
            source.transform.SetParent(transform, false);
            source.playOnAwake = false;
            source.loop = loop;
            source.spatialBlend = 0f;          // plain stereo: the island is not a 3D soundscape
            return source;
        }

        public void Play(SoundCue cue, float volume = 1f)
        {
            if (!_rules.TryPlay(cue, Time.unscaledTime)) return;
            var clip = _bank.Get(cue);
            if (clip == null) return;
            var voice = FreeVoice();
            voice.clip = clip;
            voice.volume = SoundCues.Info(cue).Volume * Mathf.Clamp01(volume);
            voice.Play();
            _recent.Enqueue(cue);
            while (_recent.Count > 12) _recent.Dequeue();
        }

        // A source that is not playing, else the one that has been playing longest.
        AudioSource FreeVoice()
        {
            for (int i = 0; i < VoiceCount; i++)
            {
                var voice = _voices[(_next + i) % VoiceCount];
                if (!voice.isPlaying) { _next = (_next + i + 1) % VoiceCount; return voice; }
            }
            var oldest = _voices[_next];
            _next = (_next + 1) % VoiceCount;
            return oldest;
        }

        void Update()
        {
            // Turning Sound off silences what is sounding right now, not only what comes next.
            bool soundOn = _settings.SoundOn;
            if (_soundWasOn && !soundOn) foreach (var voice in _voices) voice.Stop();
            _soundWasOn = soundOn;
        }

        // Nothing sounds while the app is in the background.
        void OnApplicationPause(bool paused) => AudioListener.pause = paused;

        void OnDestroy()
        {
            if (Sfx.Sink == (ISoundSink)this) Sfx.Sink = null;
        }
    }
}
