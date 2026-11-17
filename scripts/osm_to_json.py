#!/usr/bin/env python3
"""Wandelt eine Overpass-JSON-Antwort in das Projektformat um.

Abfrage (overpass-turbo.eu, Ausgabe als JSON speichern):

    [out:json][timeout:300];
    area["ISO3166-1"="DE"][admin_level=2]->.de;
    (
      nwr["shop"="farm"](area.de);
      nwr["amenity"="vending_machine"]["vending"~"milk|eggs|meat|food"](area.de);
    );
    out center tags;

Aufruf:  python3 -I scripts/osm_to_json.py overpass.json > data/osm-import.json

Datenquelle: OpenStreetMap (ODbL). Quellenangabe auf der Website ist Pflicht.
"""
import json
import sys


def normalize(el):
    tags = el.get("tags", {})
    center = el.get("center") or {}
    lat = el.get("lat") or center.get("lat")
    lon = el.get("lon") or center.get("lon")

    if tags.get("shop") == "farm":
        typ = "hofladen"
    elif tags.get("amenity") == "vending_machine":
        typ = "automat"
    else:
        return None

    strasse = " ".join(filter(None, [tags.get("addr:street"), tags.get("addr:housenumber")]))
    return {
        "id": f"osm-{el['type']}-{el['id']}",
        "typ": typ,
        "automat_art": tags.get("vending") if typ == "automat" else None,
        "name": tags.get("name"),
        "adresse": {
            "strasse": strasse or None,
            "plz": tags.get("addr:postcode"),
            "ort": tags.get("addr:city"),
        },
        "koordinaten": {"lat": lat, "lon": lon} if lat and lon else None,
        "oeffnungszeiten": tags.get("opening_hours"),
        "kontakt": {
            "telefon": tags.get("contact:phone") or tags.get("phone"),
            "email": tags.get("contact:email") or tags.get("email"),
            "website": tags.get("contact:website") or tags.get("website"),
        },
        "quellen": ["https://www.openstreetmap.org/" + el["type"] + "/" + str(el["id"])],
        "verifiziert": False,
    }


def main():
    with open(sys.argv[1], encoding="utf-8") as f:
        data = json.load(f)
    entries = [n for n in (normalize(el) for el in data.get("elements", [])) if n]
    entries.sort(key=lambda e: (e["adresse"]["plz"] or "", e["name"] or ""))
    json.dump(entries, sys.stdout, ensure_ascii=False, indent=2)
    print()
    ohne_plz = sum(1 for e in entries if not e["adresse"]["plz"])
    print(f"{len(entries)} Einträge, davon {ohne_plz} ohne PLZ", file=sys.stderr)


if __name__ == "__main__":
    main()
