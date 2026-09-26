"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import {
  MapContainer,
  Marker,
  Rectangle,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";

import { cn } from "@/lib/utils";

// Dhaka, which is where the departments being modelled actually operate.
export const DEFAULT_CENTER = [23.8103, 90.4125];
const DEFAULT_ZOOM = 12;

// Leaflet's stock marker is two PNGs fetched from unpkg.com at runtime. That means
// the pin silently disappears on any machine without internet access to a CDN, which
// is exactly the situation during local development. A divIcon is inline DOM, so the
// pin is part of the bundle and always renders.
const pinIcon = L.divIcon({
  className: "civictrack-pin",
  html: '<span class="civictrack-pin__dot"></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 26],
  popupAnchor: [0, -26],
});

// Turns map clicks into coordinate changes. It has to live inside MapContainer,
// because useMapEvents needs the map instance from context.
const ClickHandler = ({ onPick }) => {
  useMapEvents({
    click(event) {
      onPick(Number(event.latlng.lat.toFixed(6)), Number(event.latlng.lng.toFixed(6)));
    },
  });
  return null;
};

// Keeps the pin visible when the coordinates are changed from outside the map — someone
// typing into the latitude/longitude inputs, or the ward auto-detection moving the pin.
// Leaflet moves the Marker itself from its `position` prop, but the viewport stays put,
// so without this the pin can end up scrolled off screen.
const KeepPinInView = ({ latitude, longitude }) => {
  const map = useMap();

  useEffect(() => {
    if (latitude === null || longitude === null) {
      return;
    }

    const target = L.latLng(latitude, longitude);
    if (!map.getBounds().contains(target)) {
      map.panTo(target, { animate: true });
    }
  }, [map, latitude, longitude]);

  return null;
};

const LocationPicker = ({
  latitude = null,
  longitude = null,
  onPick,
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  // The selected ward's bounding box, drawn as a rectangle so the citizen can see
  // whether the pin they dropped is actually inside the ward they selected.
  wardBounds = null,
  className,
}) => {
  const hasPin = latitude !== null && longitude !== null;

  // Bounds arrive from the API as DECIMAL strings ("23.7200000"), so they need
  // parsing before Leaflet will accept them.
  const rectangle = useMemo(() => {
    if (!wardBounds) {
      return null;
    }

    const south = Number(wardBounds.min_latitude);
    const west = Number(wardBounds.min_longitude);
    const north = Number(wardBounds.max_latitude);
    const east = Number(wardBounds.max_longitude);

    if (![south, west, north, east].every(Number.isFinite)) {
      return null;
    }

    return [
      [south, west],
      [north, east],
    ];
  }, [wardBounds]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border",
        className,
      )}
    >
      <MapContainer
        center={center}
        zoom={zoom}
        // A map inside a scrolling form should not eat the page's scroll wheel; the
        // user can still zoom with the +/− controls.
        scrollWheelZoom={false}
        className="h-72 w-full"
        style={{ height: "18rem", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <ClickHandler onPick={onPick} />
        <KeepPinInView latitude={latitude} longitude={longitude} />

        {rectangle && (
          <Rectangle
            bounds={rectangle}
            pathOptions={{
              color: "#2563eb",
              weight: 1.5,
              dashArray: "5 4",
              fillOpacity: 0.06,
            }}
          />
        )}

        {hasPin && (
          <Marker
            position={[latitude, longitude]}
            icon={pinIcon}
            draggable
            eventHandlers={{
              dragend(event) {
                const { lat, lng } = event.target.getLatLng();
                onPick(Number(lat.toFixed(6)), Number(lng.toFixed(6)));
              },
            }}
          />
        )}
      </MapContainer>
    </div>
  );
};

export default LocationPicker;
