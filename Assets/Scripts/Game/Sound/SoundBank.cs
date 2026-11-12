using System.Collections.Generic;
using UnityEngine;

namespace ResortEmpire.Game.Sound
{
    // CAM-117: the clip behind a cue. A real sound placed in Resources/Sound and named like the cue (for example
    // Resources/Sound/WorkerMoved.wav) is used when it is there; otherwise the placeholder made in code stands in.
    public sealed class SoundBank
    {
        readonly Dictionary<SoundCue, AudioClip> _clips = new Dictionary<SoundCue, AudioClip>();

        public AudioClip Get(SoundCue cue)
        {
            if (_clips.TryGetValue(cue, out var clip)) return clip;
            clip = Resources.Load<AudioClip>("Sound/" + cue);
            if (clip == null)
            {
                var samples = ProceduralSounds.Make(cue);
                if (samples != null)
                {
                    clip = AudioClip.Create(cue.ToString(), samples.Length, 1, ProceduralSounds.Rate, false);
                    clip.SetData(samples, 0);
                }
            }
            _clips[cue] = clip;
            return clip;
        }
    }
}
