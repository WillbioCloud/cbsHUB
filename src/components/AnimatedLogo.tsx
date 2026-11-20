const paths = [
  {
    d: "M335 200H665C750 200 810 259 810 345V375H655V364C655 351 644 340 631 340H369C350 340 335 355 335 374V426C335 439 346 450 359 450H518C533 450 540 468 529 478L425 574C413 585 398 590 382 590H320C242 590 190 535 190 457V345C190 259 250 200 335 200Z",
    fill: "#29256B",
  },
  {
    d: "M618 410H680C758 410 810 465 810 543V605C810 691 750 750 665 750H439L309 824C296 832 280 823 280 808V744C225 728 190 680 190 615V625H345V586C345 599 356 610 369 610H631C650 610 665 595 665 576V574C665 561 654 550 641 550H482C467 550 460 532 471 522L575 426C587 415 602 410 618 410Z",
    fill: "#12C9BD",
  },
] as const;
export function AnimatedLogo() {
  return (
    <svg
      className="animated-official-logo"
      role="img"
      aria-label="Logo oficial cbsHUB animada"
      viewBox="159.2466 172.7397 681.5068 681.5068"
      width="200"
      height="200"
    >
      <title>cbsHUB</title>
      {paths.map((path, index) => (
        <path
          key={index}
          d={path.d}
          fill={path.fill}
          className={index === 0 ? "logo-upper" : "logo-lower"}
        />
      ))}
    </svg>
  );
}
