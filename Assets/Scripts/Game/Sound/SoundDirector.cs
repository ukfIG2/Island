using System;
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
        const float FadeSeconds = 1f;           // how fast the sea and the rain come and go
        const float CrossfadeSeconds = 2f;      // between the two moods of music
        const float DuckSeconds = 0.6f;         // how fast the music steps back under the result screen

        AppSettings _settings;
        SoundRules _rules;
        SoundBank _bank;
        SoundWatcher _watcher;
        AudioSource[] _voices;
        AudioSource _ocean, _rain, _musicCalm, _musicBusy;
        float _oceanLevel, _rainLevel;          // 0..1 of the loop's own loudness, moved smoothly
        float _calmLevel, _busyLevel, _duck = 1f;
        GameController _game;
        float _nextGull;
        Func<bool> _raining;
        int _next;
        bool _soundWasOn;
        readonly Queue<SoundCue> _recent = new Queue<SoundCue>();

        // The last few cues that sounded, newest last. Only for checking the sound in Play mode.
        public IReadOnlyCollection<SoundCue> Recent => _recent;

        // raining says whether the island's weather is rain right now; the rain is heard only then.
        public static SoundDirector Create(Transform parent, GameController game, AppSettings settings, Func<bool> raining)
        {
            var go = new GameObject("Sound");
            go.transform.SetParent(parent, false);
            var director = go.AddComponent<SoundDirector>();
            director.Init(game, settings, raining);
            return director;
        }

        void Init(GameController game, AppSettings settings, Func<bool> raining)
        {
            _game = game;
            _raining = raining;
            _settings = settings;
            _watcher = new SoundWatcher(game, Play);
            _rules = new SoundRules(settings);
            _bank = new SoundBank();
            _voices = new AudioSource[VoiceCount];
            for (int i = 0; i < VoiceCount; i++) _voices[i] = NewSource("Voice" + i, false);
            _ocean = NewSource("Ocean", true);
            _rain = NewSource("Rain", true);
            _musicCalm = NewSource("MusicCalm", true);
            _musicBusy = NewSource("MusicBusy", true);
            _bank.TryGet(SoundCue.Ocean);               // the long loops start being made now, in the background
            _bank.TryGet(SoundCue.MusicCalm);
            _bank.TryGet(SoundCue.MusicBusy);
            _nextGull = Time.unscaledTime + 8f;
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
            voice.panStereo = cue == SoundCue.Gull ? UnityEngine.Random.Range(-0.7f, 0.7f) : 0f;   // a gull is somewhere over the water
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
            _watcher.Poll();
            // Turning Sound off silences what is sounding right now, not only what comes next.
            bool soundOn = _settings.SoundOn;
            if (_soundWasOn && !soundOn) foreach (var voice in _voices) voice.Stop();
            _soundWasOn = soundOn;

            float dt = Time.unscaledDeltaTime;
            bool raining = _raining != null && _raining();
            if (_ocean.clip == null) _ocean.clip = _bank.TryGet(SoundCue.Ocean);
            if (raining && _rain.clip == null) _rain.clip = _bank.TryGet(SoundCue.Rain);   // made the first time it rains
            Fade(_ocean, ref _oceanLevel, soundOn ? 1f : 0f, SoundCue.Ocean, soundOn ? FadeSeconds : 0f, 1f, dt);
            Fade(_rain, ref _rainLevel, soundOn && raining ? 1f : 0f, SoundCue.Rain, soundOn ? FadeSeconds : 0f, 1f, dt);

            // Music: one mood at a time, a 2 second crossfade between them, a step back under the result screen.
            // Turning Music off silences it almost at once.
            bool musicOn = _settings.MusicOn;
            bool busy = MusicMood.Busy(_game);
            if (_musicCalm.clip == null) _musicCalm.clip = _bank.TryGet(SoundCue.MusicCalm);
            if (_musicBusy.clip == null) _musicBusy.clip = _bank.TryGet(SoundCue.MusicBusy);
            _duck = Mathf.MoveTowards(_duck, MusicMood.Duck(_game), dt / DuckSeconds);
            float seconds = musicOn ? CrossfadeSeconds : 0.25f;
            Fade(_musicCalm, ref _calmLevel, musicOn && !busy ? 1f : 0f, SoundCue.MusicCalm, seconds, _duck, dt);
            Fade(_musicBusy, ref _busyLevel, musicOn && busy ? 1f : 0f, SoundCue.MusicBusy, seconds, _duck, dt);

            if (soundOn && Time.unscaledTime >= _nextGull)
            {
                _nextGull = Time.unscaledTime + UnityEngine.Random.Range(14f, 34f);
                Play(SoundCue.Gull, UnityEngine.Random.Range(0.5f, 1f));
            }
        }

        // Moves a loop's level toward its target over the given seconds (0 = at once) and keeps it playing only while
        // it can be heard. scale is a further factor, such as the step back under the result screen.
        void Fade(AudioSource source, ref float level, float target, SoundCue cue, float seconds, float scale, float dt)
        {
            if (source.clip == null) return;
            level = seconds <= 0f ? target : Mathf.MoveTowards(level, target, dt / seconds);
            source.volume = level * scale * SoundCues.Info(cue).Volume;
            if (level > 0f && !source.isPlaying) source.Play();
            else if (level <= 0f && source.isPlaying) source.Stop();
        }

        // Nothing sounds while the app is in the background.
        void OnApplicationPause(bool paused) => AudioListener.pause = paused;

        void OnDestroy()
        {
            _watcher?.Dispose();
            if (Sfx.Sink == (ISoundSink)this) Sfx.Sink = null;
        }
    }
}
