import { SelfIcon } from './SelfIcons';



export function SelfTimeline({ timeline }) {

  const currentHour = timeline?.currentHour ?? 0;

  const currentPct = (currentHour / 24) * 100;



  return (

    <footer className="self-timeline">

      <button type="button" className="self-timeline__play" aria-label="Play timeline">

        <SelfIcon name="timelinePlay" />

      </button>



      <div className="self-timeline__track-wrap">

        <div className="self-timeline__track">

          <div

            className="self-timeline__progress"

            style={{ width: `${currentPct}%` }}

          />



          <div

            className="self-timeline__future"

            style={{ left: `${currentPct}%`, width: `${100 - currentPct}%` }}

          />



          {(timeline?.dots ?? []).map((dot, i) => (

            <span

              key={i}

              className={`self-timeline__dot self-timeline__dot--${dot.tone}`}

              style={{ left: `${(dot.hour / 24) * 100}%` }}

            />

          ))}



          <span

            className="self-timeline__head"

            style={{ left: `${currentPct}%` }}

          />

        </div>



        <div className="self-timeline__labels">

          {(timeline?.markers ?? []).map((marker) => (

            <span key={marker}>{marker}</span>

          ))}

        </div>

      </div>

    </footer>

  );

}


