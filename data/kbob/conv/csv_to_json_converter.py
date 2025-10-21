#!/usr/bin/env python3
"""
Script to convert KBOB CSV data to JSON format maintaining the structure from the reference JSON.
"""

import pandas as pd
import json
from datetime import datetime
import os

def get_hatching_pattern(product_name, hatching_pattern_mapping_df):
    """
    Get hatching pattern based on the product name.
    Uses the hatching pattern mapping CSV to find the appropriate pattern.
    """
    if product_name is None or hatching_pattern_mapping_df is None:
        return None
    
    # Try to match by exact product name first
    pattern_row = hatching_pattern_mapping_df[hatching_pattern_mapping_df['Product Name'] == product_name]
    
    if not pattern_row.empty:
        hatching_pattern = pattern_row['Hatching Pattern'].iloc[0]
        # Return None if the hatching pattern is empty or NaN
        if pd.isna(hatching_pattern) or hatching_pattern == '':
            return None
        return hatching_pattern
    
    # If no exact match, try to match by base name (ignoring version differences)
    # Convert 2016v1 to 2022v5 for matching
    base_name = product_name.replace('(KBOB.2016v1)', '(KBOB.2022v5)')
    pattern_row = hatching_pattern_mapping_df[hatching_pattern_mapping_df['Product Name'] == base_name]
    
    if not pattern_row.empty:
        hatching_pattern = pattern_row['Hatching Pattern'].iloc[0]
        # Return None if the hatching pattern is empty or NaN
        if pd.isna(hatching_pattern) or hatching_pattern == '':
            return None
        return hatching_pattern
    
    return None

def convert_csv_to_json(csv_file_path, json_file_path, reference_json_path=None, hatching_pattern_mapping_path=None):
    """
    Convert CSV file to JSON format following the structure of the reference JSON.
    
    Args:
        csv_file_path (str): Path to the input CSV file
        json_file_path (str): Path to the output JSON file
        reference_json_path (str, optional): Path to reference JSON for structure
        hatching_pattern_mapping_path (str, optional): Path to hatching pattern mapping CSV
    """
    
    # Read the CSV file
    print(f"Reading CSV file: {csv_file_path}")
    df = pd.read_csv(csv_file_path)
    print(f"Found {len(df)} rows in CSV")
    
    # Load hatching pattern mapping if provided
    hatching_pattern_mapping_df = None
    if hatching_pattern_mapping_path and os.path.exists(hatching_pattern_mapping_path):
        print(f"Loading hatching pattern mapping: {hatching_pattern_mapping_path}")
        hatching_pattern_mapping_df = pd.read_csv(hatching_pattern_mapping_path)
        print(f"Loaded {len(hatching_pattern_mapping_df)} hatching pattern mappings")
    else:
        print("No hatching pattern mapping provided or file not found")
    
    # Prepare the output dictionary following the structure of the reference JSON
    output_json = {
        "fileFormatVersion": "1.1.0",
        "exportTimestamp": datetime.now().isoformat(),
        "products": {}
    }
    
    # Iterate through the DataFrame rows to build the product entries
    for index, row in df.iterrows():
        # Use ProductKey as the key for the products dictionary
        product_key = row["ProductKey"]
        
        # Set the linkedReferenceMaterialKey based on product type
        linked_reference_material_key = None
        if row["Type"] == "MATERIAL":
            # For materials, create a reference material key by replacing _m with _r
            if "_m" in product_key:
                linked_reference_material_key = product_key.replace("_m", "_r")
            else:
                linked_reference_material_key = product_key + "_r"
        
        # Get hatching pattern if mapping is available
        hatching_pattern = None
        if hatching_pattern_mapping_df is not None:
            hatching_pattern = get_hatching_pattern(row["Name"], hatching_pattern_mapping_df)
        
        # Create the product entry following the JSON structure
        product_entry = {
            "name": row["Name"],
            "type": row["Type"],
            "subType": None,
            "status": "approved",
            "hatchingPattern": hatching_pattern,
            "linkedReferenceMaterialKey": linked_reference_material_key,
            "categoryPath": row["categoryPath"],
            "matrix": {
                "layers": {},
                "sections": {},
                "cells": {}
            },
            "attributes": {
                "KBOB REF": row.get("KBOB REF", ""),
                "vyzn.catalogue.Density": row.get("vyzn.catalogue.Density", 0.0),
                "vyzn.catalogue.Owner": "Koordinationskonferenz der Bau- und Liegenschaftsorgane der öffentlichen Bauherren KBOB",
                "vyzn.catalogue.License": "Keine"
            }
        }
        
        # Add all the KBOB 2022 specific attributes if they exist in the CSV
        kbob_attributes = [
            "vyzn.catalogue.ch.KBOB2022.LCARefUnit",
            "vyzn.catalogue.ch.KBOB2022.UBPTotal",
            "vyzn.catalogue.ch.KBOB2022.UBPProduction", 
            "vyzn.catalogue.ch.KBOB2022.UBPDisposal",
            "vyzn.catalogue.ch.KBOB2022.RenewableEnergyTotal",
            "vyzn.catalogue.ch.KBOB2022.RenewableEnergyProduction",
            "vyzn.catalogue.ch.KBOB2022.RenewableEnergyDisposal",
            "vyzn.catalogue.ch.KBOB2022.GreyEnergyTotal",
            "vyzn.catalogue.ch.KBOB2022.GreyEnergyProduction",
            "vyzn.catalogue.ch.KBOB2022.GreyEnergyDisposal",
            "vyzn.catalogue.ch.KBOB2022.GHGEmissionsTotal",
            "vyzn.catalogue.ch.KBOB2022.GHGEmissionsProduction",
            "vyzn.catalogue.ch.KBOB2022.GHGEmissionsDisposal"
        ]
        
        for attr in kbob_attributes:
            if attr in row and pd.notna(row[attr]):
                product_entry["attributes"][attr] = row[attr]
            
        # Add the product to the output
        output_json["products"][product_key] = product_entry
        
        # Print progress every 50 items
        if (index + 1) % 50 == 0:
            print(f"Processed {index + 1} items...")
    
    # Save the JSON to a file
    print(f"Saving JSON to: {json_file_path}")
    with open(json_file_path, "w", encoding="utf-8") as f:
        json.dump(output_json, f, indent=2, ensure_ascii=False)
    
    print(f"Conversion completed! Created {len(output_json['products'])} products in JSON format.")
    return output_json

def main():
    """Main function to run the conversion."""
    
    # Define file paths
    csv_file = "kbob_2016.csv"
    json_file = "kbob_2016_converted.json"
    reference_json = "kbob_2022_v5_ref.json"
    hatching_pattern_mapping = "/Users/mtschudi/Documents/GitHub/vyzn/parse_lesosai_components/KBOB_hatchingpattern_mapping.csv"
    
    # Check if files exist
    if not os.path.exists(csv_file):
        print(f"Error: CSV file '{csv_file}' not found!")
        return
    
    if not os.path.exists(reference_json):
        print(f"Warning: Reference JSON file '{reference_json}' not found, proceeding without it.")
        reference_json = None
    
    if not os.path.exists(hatching_pattern_mapping):
        print(f"Warning: Hatching pattern mapping file '{hatching_pattern_mapping}' not found, proceeding without it.")
        hatching_pattern_mapping = None
    
    # Run the conversion
    try:
        result = convert_csv_to_json(csv_file, json_file, reference_json, hatching_pattern_mapping)
        print(f"\nConversion successful!")
        print(f"Output file: {json_file}")
        print(f"Total products converted: {len(result['products'])}")
        
    except Exception as e:
        print(f"Error during conversion: {str(e)}")
        return

if __name__ == "__main__":
    main()
