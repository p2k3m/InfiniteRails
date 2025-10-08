          : 'Audio sample "welcome" is unavailable. Playing fallback beep instead.';
        const suffix = 'Fallback beep active until audio assets are restored.';
        if (/(fallback (alert )?tone|fallback beep)/i.test(trimmed)) {
        if (/fallback/i.test(trimmed) && /(audio|tone|beep)/i.test(trimmed)) {
        const suffix = 'Fallback beep active until audio assets are restored.';
        if (/(fallback (alert )?tone|fallback beep)/i.test(trimmed)) {
        if (/fallback/i.test(trimmed) && /(audio|tone|beep)/i.test(trimmed)) {
          'No embedded audio samples were detected. Gameplay actions will fall back to a beep until audio assets are restored.',
          `One or more audio aliases do not resolve to an available sample. Missing mappings: ${detail}. A fallback beep will be used until the samples are restored.`,
        messageParts.push('A fallback beep will be used until the audio files are restored.');
            message: `Audio sample "${nameForLog}" is unavailable. Playing fallback beep instead.`,
