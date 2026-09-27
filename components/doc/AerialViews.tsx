import { Section } from './primitives';
import { aerialViews } from '@/lib/nyc/aerial';

/**
 * Photographs of the building, beside its numbers.
 *
 * The 3D map shows where it is; these show what it actually looks like — roof
 * condition, courtyard, how it sits against its neighbours. Renders nothing at
 * all when there is no footprint or no Mapbox token, rather than leaving a
 * broken frame in the middle of the record.
 */
export function AerialViews({
  centre,
  geometry,
  address,
}: {
  readonly centre: readonly [number, number] | null;
  readonly geometry?: unknown;
  readonly address: string;
}) {
  if (centre === null) return null;

  const views = aerialViews({ centre, geometry, address });
  if (views.length === 0) return null;

  return (
    <Section title="The building" aside="Satellite imagery">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {views.map((view) => (
          <figure key={view.label} className="m-0">
            {/* Plain img, not next/image: these are one-off remote URLs that are
                already sized by the request, so the optimizer would add a hop
                and a per-image cost for nothing. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={view.url}
              alt={view.alt}
              width={720}
              height={460}
              loading="lazy"
              className="block w-full border border-paper-edge bg-city-deep object-cover"
            />
            <figcaption className="mt-1.5 text-[0.75rem] text-ink-faint">{view.label}</figcaption>
          </figure>
        ))}
      </div>
      <p className="mt-3 text-[0.75rem] leading-relaxed text-ink-faint">
        Satellite imagery ©{' '}
        <a
          href="https://www.maxar.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          Maxar
        </a>{' '}
        via{' '}
        <a
          href="https://www.mapbox.com/about/maps/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          Mapbox
        </a>
        . The outline is this building&apos;s footprint from{' '}
        <a
          href="https://data.cityofnewyork.us/d/5zhs-2jue"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          NYC Building Footprints
        </a>
        . Imagery is not dated by the city and may be a few years old.
      </p>
    </Section>
  );
}
