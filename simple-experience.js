      const buildReasonRaw =
        typeof options.buildReason === 'string' ? options.buildReason.trim() : '';
      const buildReason = buildReasonRaw.length ? buildReasonRaw : reason;
