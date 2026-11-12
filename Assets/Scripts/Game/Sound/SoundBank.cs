using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEngine;

namespace ResortEmpire.Game.Sound
{
    // CAM-117: the clip behind a cue. A real sound placed in Resources/Sound and named like the cue (for example
    // Resources/Sound/WorkerMoved.wav) is used when it is there; otherwise the placeholder made in code stands in.
    public sealed class SoundBank
    {
        readonly Dictionary<SoundCue, AudioClip> _clips = new Dictionary<SoundCue, AudioClip>();
        readonly Dictionary<SoundCue, Task<float[]>> _making = new Dictionary<SoundCue, Task<float[]>>();

        // For the long loops: the clip if it is ready, else null while it is being made in the background, so the game
        // never stalls at the start. Ask again next frame.
        public AudioClip TryGet(SoundCue cue)
        {
            if (_clips.TryGetValue(cue, out var clip)) return clip;
            if (!_making.TryGetValue(cue, out var task))
            {
                var real = Resources.Load<AudioClip>("Sound/" + cue);
                if (real != null)
                {
                    _clips[cue] = real;
                    return real;
                }
                task = Task.Run(() => ProceduralSounds.Make(cue));
                _making[cue] = task;
            }
            if (!task.IsCompleted) return null;
            _making.Remove(cue);
            _clips[cue] = FromSamples(cue, task.IsFaulted ? null : task.Result);
            return _clips[cue];
        }

        static AudioClip FromSamples(SoundCue cue, float[] samples)
        {
            if (samples == null) return null;
            var clip = AudioClip.Create(cue.ToString(), samples.Length, 1, ProceduralSounds.Rate, false);
            clip.SetData(samples, 0);
            return clip;
        }

        public AudioClip Get(SoundCue cue)
        {
            if (_clips.TryGetValue(cue, out var clip)) return clip;
            clip = Resources.Load<AudioClip>("Sound/" + cue);
            if (clip == null)
            {
                clip = FromSamples(cue, ProceduralSounds.Make(cue));
            }
            _clips[cue] = clip;
            return clip;
        }
    }
}
