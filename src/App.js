const onBodyScroll = () => {
  if (syncing.current) return;
  syncing.current = true;

  requestAnimationFrame(() => {
    const body = bodyRef.current;
    const header = headerRef.current;
    const left = leftRef.current;

    if (body && header) {
      header.scrollLeft = body.scrollLeft;

      // ✅ ヘッダー側でクランプされた値を読み戻して本体へも反映（最後まで揃える）
      const fixed = header.scrollLeft;
      if (body.scrollLeft !== fixed) body.scrollLeft = fixed;
    }

    if (body && left) {
      left.scrollTop = body.scrollTop;

      // ✅ 左側でも同様にクランプ補正
      const fixedTop = left.scrollTop;
      if (body.scrollTop !== fixedTop) body.scrollTop = fixedTop;
    }

    syncing.current = false;
  });
};

const onHeaderScroll = () => {
  if (syncing.current) return;
  syncing.current = true;

  requestAnimationFrame(() => {
    const body = bodyRef.current;
    const header = headerRef.current;

    if (body && header) {
      body.scrollLeft = header.scrollLeft;

      // ✅ 本体側のクランプ値をヘッダーへ戻して完全一致
      const fixed = body.scrollLeft;
      if (header.scrollLeft !== fixed) header.scrollLeft = fixed;
    }

    syncing.current = false;
  });
};

const onLeftScroll = () => {
  if (syncing.current) return;
  syncing.current = true;

  requestAnimationFrame(() => {
    const body = bodyRef.current;
    const left = leftRef.current;

    if (body && left) {
      body.scrollTop = left.scrollTop;

      // ✅ 本体側のクランプ値を左列へ戻して完全一致
      const fixedTop = body.scrollTop;
      if (left.scrollTop !== fixedTop) left.scrollTop = fixedTop;
    }

    syncing.current = false;
  });
};